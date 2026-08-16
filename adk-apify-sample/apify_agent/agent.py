import os

from google.adk.agents import LlmAgent
from google.adk.tools.mcp_tool import McpToolset
from google.adk.tools.mcp_tool.mcp_session_manager import StreamableHTTPConnectionParams

APIFY_TOKEN = os.getenv("APIFY_TOKEN")
APIFY_MCP_URL = os.getenv(
    "APIFY_MCP_URL",
    "https://mcp.apify.com/?tools=apify/e-commerce-scraping-tool,get-actor-run,get-dataset-items",
)

if not APIFY_TOKEN:
    raise RuntimeError("APIFY_TOKEN is not set. Export it or add it to .env")

apify_toolset = McpToolset(
    connection_params=StreamableHTTPConnectionParams(
        url=APIFY_MCP_URL,
        headers={
            "Authorization": f"Bearer {APIFY_TOKEN}",
            "Content-Type": "application/json",
        },
    )
)

root_agent = LlmAgent(
    model="gemini-2.5-flash",
    name="product_scout_agent",
    description="Finds live e-commerce product data by calling Apify Actors as MCP tools.",
    instruction=(
        "You are a product research agent. Use the Apify e-commerce scraping tool to "
        "find real product offers for the user's query. Actor runs are asynchronous: "
        "if a tool returns a run that is still RUNNING, call get-actor-run with the "
        "runId to wait for it, then call get-dataset-items with the datasetId to read "
        "the products. Summarize at most 5 products with name, price, currency and URL."
    ),
    tools=[apify_toolset],
)
