import asyncio
import os

from dotenv import load_dotenv

load_dotenv()

from google.adk.runners import Runner
from google.adk.sessions import InMemorySessionService
from google.genai import types

from apify_agent.agent import apify_toolset, root_agent

APP_NAME = "apify_product_scout"
USER_ID = "article-author"


async def main() -> None:
    prompt = os.getenv("PROMPT", "Find me ecommerce products for a poodle dog harness")
    session_service = InMemorySessionService()
    session = await session_service.create_session(app_name=APP_NAME, user_id=USER_ID)
    runner = Runner(agent=root_agent, app_name=APP_NAME, session_service=session_service)
    message = types.Content(role="user", parts=[types.Part(text=prompt)])
    try:
        async for event in runner.run_async(
            user_id=USER_ID, session_id=session.id, new_message=message
        ):
            if not event.content or not event.content.parts:
                continue
            for part in event.content.parts:
                if getattr(part, "text", None):
                    print(part.text)
                elif getattr(part, "function_call", None):
                    print(f"[tool call] {part.function_call.name}")
    finally:
        await apify_toolset.close()


if __name__ == "__main__":
    asyncio.run(main())
