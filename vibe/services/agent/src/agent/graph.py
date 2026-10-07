from langchain_openai import ChatOpenAI
from agent.config.settings import settings
from agent.graphs.workflow import create_workflow

llm = ChatOpenAI(
    model=settings.llm_model,
    api_key=settings.llm_api_key,
    base_url=settings.llm_base_url,
    temperature=settings.llm_temperature,
    max_tokens=settings.llm_max_tokens,
)

workflow = create_workflow(llm)
graph = workflow.compile()
