import aiohttp
import asyncio
import os
import sys

from loguru import logger
from dotenv import load_dotenv

from pipecat.audio.vad.silero import SileroVADAnalyzer
from pipecat.frames.frames import EndFrame
from pipecat.pipeline.pipeline import Pipeline
from pipecat.pipeline.runner import PipelineRunner
from pipecat.pipeline.task import PipelineParams, PipelineTask
from pipecat.processors.aggregators.openai_llm_context import OpenAILLMContext
from pipecat.services.nim.llm import NimLLMService
from pipecat.services.riva.stt import RivaSTTService
from pipecat.services.riva.tts import RivaTTSService
from pipecat.transports.services.daily import DailyParams, DailyTransport
from pipecat.transports.services.helpers.daily_rest import (
    DailyRESTHelper,
    DailyRoomParams,
)

logger.remove(0)
logger.add(sys.stderr, level="DEBUG")
load_dotenv()

prompt_dir = os.getenv("PROMPT_DIR", "prompts")
prompt_file = os.getenv("SYSTEM_PROMPT_FILE", "prompt-vp.txt")
with open(os.path.join(prompt_dir, prompt_file), "r") as f:
    SYSTEM_PROMPT = f.read()


async def main():
    async with aiohttp.ClientSession() as session:
        candidate_id = os.getenv("CANDIDATE_ID")
        meeting_id = os.getenv("MEETING_ID")
        api_url = os.getenv("API_URL", "http://localhost:3000")

        candidate_name = "Candidate"
        role = "Applied Position"
        jd = "Not provided"
        resume = "Not provided"

        # Fetch candidate context if CANDIDATE_ID is provided
        if candidate_id:
            try:
                async with session.get(f"{api_url}/api/candidate/{candidate_id}/context") as resp:
                    if resp.status == 200:
                        data = await resp.json()
                        candidate_name = data.get("candidateName", "Candidate")
                        role = data.get("role", "Applied Position")
                        jd = data.get("jd", "Not provided")
                        resume = data.get("resume", "Not provided")
                        print(f"Loaded context for candidate: {candidate_name} ({role})")
                    else:
                        print(f"Failed to fetch candidate context: {resp.status} - {await resp.text()}")
            except Exception as e:
                print(f"Error fetching candidate context: {e}")

        # Inject context dynamically into system prompt
        system_prompt_formatted = (
            f"{SYSTEM_PROMPT}\n\n"
            f"You are conducting the interview with candidate {candidate_name} for the position of {role}.\n\n"
            f"JOB DESCRIPTION:\n{jd}\n\n"
            f"CANDIDATE RESUME:\n{resume}\n"
        )

        daily_rest_helper = DailyRESTHelper(
            daily_api_key=os.getenv("DAILY_API_KEY"),
            daily_api_url=os.getenv("DAILY_API_URL", "https://api.daily.co/v1"),
            aiohttp_session=session,
        )

        room_config = await daily_rest_helper.create_room(
            DailyRoomParams(properties={"enable_prejoin_ui": False})
        )
        room_url = room_config.url
        bot_name = os.getenv("BOT_NAME", "Lydia")

        print("___________________________________*")
        print("___________________________________*")
        print(f"___________________________________* Navigate to")
        print(f"___________________________________* {room_url}")
        print(f"___________________________________* to talk to {bot_name}.")
        print("___________________________________*")
        print("___________________________________*")

        transport = DailyTransport(
            room_url,
            None,
            bot_name,
            DailyParams(
                audio_in_enabled=True,
                audio_out_enabled=True,
                vad_analyzer=SileroVADAnalyzer(),
                audio_in_passthrough=True,
            ),
        )

        stt = RivaSTTService(api_key=os.getenv("NVIDIA_API_KEY"))

        llm = NimLLMService(
            api_key=os.getenv("NVIDIA_API_KEY"),
            model=os.getenv("LLM_MODEL", "meta/llama-3.3-70b-instruct"),
        )

        tts = RivaTTSService(
            api_key=os.getenv("NVIDIA_API_KEY"),
            voice_id=os.getenv("TTS_VOICE_ID", "Magpie-Multilingual.EN-US.Sofia"),
        )

        messages = [{"role": "system", "content": system_prompt_formatted}]
        tools = []

        context = OpenAILLMContext(messages, tools if tools else None)
        context_aggregator = llm.create_context_aggregator(context)

        pipeline = Pipeline(
            [
                transport.input(),
                stt,
                context_aggregator.user(),
                llm,
                tts,
                transport.output(),
                context_aggregator.assistant(),
            ]
        )

        task = PipelineTask(
            pipeline,
            params=PipelineParams(
                allow_interruptions=True,
                enable_metrics=True,
            ),
        )

        @transport.event_handler("on_first_participant_joined")
        async def on_first_participant_joined(transport, participant):
            await task.queue_frames([context_aggregator.user().get_context_frame()])

        @transport.event_handler("on_participant_left")
        async def on_participant_left(transport, participant, reason):
            print(f"Participant left: {participant}")
            await task.queue_frame(EndFrame())

        runner = PipelineRunner()

        await runner.run(task)

        # After the meeting has finished, post transcript to the backend
        if candidate_id and meeting_id:
            print("Interview finished. Exporting transcript to backend...")
            try:
                # Compile history from context.messages
                history_payload = []
                for msg in context.messages:
                    if msg.get("role") in ["user", "assistant"]:
                        history_payload.append({
                            "role": msg.get("role"),
                            "content": msg.get("content") or msg.get("text") or ""
                        })

                payload = {
                    "meetingId": meeting_id,
                    "candidateId": candidate_id,
                    "history": history_payload
                }

                async with session.post(f"{api_url}/api/meeting/save-transcript", json=payload) as save_resp:
                    if save_resp.status == 200:
                        print("Transcript exported successfully.")
                    else:
                        print(f"Failed to export transcript: {save_resp.status} - {await save_resp.text()}")
            except Exception as e:
                print(f"Error exporting transcript: {e}")


if __name__ == "__main__":
    asyncio.run(main())
