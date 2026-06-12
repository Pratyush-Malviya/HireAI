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

        messages = [{"role": "system", "content": SYSTEM_PROMPT}]

        tools = []
        tool_functions = {}

        weather_enabled = os.getenv("TOOL_WEATHER_ENABLED", "true").lower() == "true"

        if weather_enabled:
            from noaa_sdk import NOAA
            from openai.types.chat import ChatCompletionToolParam

            async def get_noaa_weather(latitude: float, longitude: float):
                n = NOAA()
                description = False
                fahrenheit_temp = 0
                try:
                    observations = n.get_observations_by_lat_lon(
                        latitude, longitude, num_of_stations=1
                    )
                    for observation in observations:
                        description = observation["textDescription"]
                        celsius_temp = observation["temperature"]["value"]
                        if description:
                            break
                    fahrenheit_temp = (celsius_temp * 9 / 5) + 32
                    if fahrenheit_temp and not description:
                        description = fahrenheit_temp
                except Exception as e:
                    print(f"Error getting NOAA weather: {e}")
                return description, fahrenheit_temp

            async def fetch_weather(params):
                args = params.arguments
                result_callback = params.result_callback
                location = args["location"]
                latitude = float(args["latitude"])
                longitude = float(args["longitude"])

                if latitude and longitude:
                    description, fahrenheit_temp = await get_noaa_weather(
                        latitude, longitude
                    )
                    if not description:
                        await result_callback(
                            f"I'm sorry, I can't get the weather for {location} right now."
                        )
                    else:
                        await result_callback(
                            f"The weather in {location} is currently {round(fahrenheit_temp)} degrees and {description}."
                        )
                else:
                    await result_callback("Sorry, I don't recognize that location.")

            tools.append(
                ChatCompletionToolParam(
                    type="function",
                    function={
                        "name": "get_weather",
                        "description": "Get the current weather",
                        "parameters": {
                            "type": "object",
                            "properties": {
                                "location": {
                                    "type": "string",
                                    "description": "The location for the weather request.",
                                },
                                "latitude": {
                                    "type": "string",
                                    "description": "Infer the latitude from the location.",
                                },
                                "longitude": {
                                    "type": "string",
                                    "description": "Infer the longitude from the location.",
                                },
                            },
                            "required": ["location", "latitude", "longitude"],
                        },
                    },
                )
            )
            tool_functions["get_weather"] = fetch_weather

        for name, func in tool_functions.items():
            llm.register_function(name, func)

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


if __name__ == "__main__":
    asyncio.run(main())
