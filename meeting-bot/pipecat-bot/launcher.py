import argparse
import asyncio
import os
import sys

from dotenv import load_dotenv

load_dotenv()


async def launch_bot(bot_name: str = None, prompt_file: str = None):
    os.environ.setdefault("BOT_NAME", bot_name or "Lydia")
    os.environ.setdefault("SYSTEM_PROMPT_FILE", prompt_file or "prompt-vp.txt")
    from bot import main
    await main()


def list_prompts():
    prompt_dir = os.getenv("PROMPT_DIR", "prompts")
    if not os.path.isdir(prompt_dir):
        print(f"No prompts directory found at {prompt_dir}")
        return
    prompts = [f for f in os.listdir(prompt_dir) if f.endswith(".txt")]
    if not prompts:
        print(f"No .txt prompt files found in {prompt_dir}/")
        return
    print("Available prompts:")
    for p in prompts:
        print(f"  - {p}")


def main():
    parser = argparse.ArgumentParser(description="Pipecat Meeting Bot Launcher")
    parser.add_argument(
        "--bot-name",
        default="Lydia",
        help="Name for the bot (default: Lydia)",
    )
    parser.add_argument(
        "--prompt",
        default="prompt-vp.txt",
        help="Prompt file in prompts/ directory (default: prompt-vp.txt)",
    )
    parser.add_argument(
        "--list-prompts",
        action="store_true",
        help="List available prompt files and exit",
    )

    args = parser.parse_args()

    if args.list_prompts:
        list_prompts()
        return

    prompt_path = os.path.join(
        os.getenv("PROMPT_DIR", "prompts"), args.prompt
    )
    if not os.path.isfile(prompt_path):
        print(f"Prompt file not found: {prompt_path}")
        print("Use --list-prompts to see available prompts")
        sys.exit(1)

    print(f"Launching bot '{args.bot_name}' with prompt '{args.prompt}'")
    asyncio.run(launch_bot(args.bot_name, args.prompt))


if __name__ == "__main__":
    main()
