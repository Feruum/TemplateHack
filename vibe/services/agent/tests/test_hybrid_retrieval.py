import uuid

import chromadb
from chromadb.config import Settings as ChromaSettings
from langchain_chroma import Chroma
from langchain_core.documents import Document
from langchain_core.embeddings import Embeddings
import pytest

from agent.config.settings import settings
from agent.knowledge.chroma import ChromaKnowledgeIndex


class ControlledEmbeddings(Embeddings):
    """Deliberately weak vectors make the keyword-search contribution measurable."""

    def embed_documents(self, texts):
        return [[0., 1.] if 'AX-42' in text else [1., 0.] for text in texts]

    def embed_query(self, text):
        return [1., 0.]


@pytest.fixture
def index(monkeypatch):
    store = Chroma(
        client=chromadb.EphemeralClient(ChromaSettings(anonymized_telemetry=False)),
        collection_name=f'test-{uuid.uuid4()}',
        embedding_function=ControlledEmbeddings(),
    )
    monkeypatch.setattr('agent.knowledge.chroma.get_vector_store', lambda: store)
    adapter = ChromaKnowledgeIndex()
    adapter.add_documents([
        Document(page_content='General information about opening hours.', metadata={'id': 'a-0', 'owner_id': 'a', 'document_id': 'general', 'source': 'general.txt'}),
        Document(page_content='Ticket AX-42: возврат билета доступен в течение 30 дней.', metadata={'id': 'a-1', 'owner_id': 'a', 'document_id': 'ticket', 'source': 'ticket.txt'}),
        Document(page_content='AX-42 belongs to another account. Private information.', metadata={'id': 'b-0', 'owner_id': 'b', 'document_id': 'private', 'source': 'private.txt'}),
    ], ids=['a-0', 'a-1', 'b-0'])
    yield adapter
    store.delete_collection()


def test_hybrid_recovers_exact_identifier_missed_by_dense_top_one(index):
    dense = index.search('AX-42', k=1, filter={'owner_id': 'a'})
    hybrid = index.search('AX-42', k=1, filter={'owner_id': 'a'}, sparse_query='AX-42')
    assert dense[0].metadata['document_id'] == 'general'
    assert hybrid[0].metadata['document_id'] == 'ticket'


def test_keyword_search_is_unicode_aware_and_keeps_owner_filter(index):
    results = index.search('refund', k=2, filter={'owner_id': 'a'}, sparse_query='ВОЗВРАТ БИЛЕТА')
    assert results[0].metadata['document_id'] == 'ticket'
    assert all(document.metadata['owner_id'] == 'a' for document in results)
    assert len({document.metadata['id'] for document in results}) == len(results)


def test_deletion_removes_keyword_results_without_a_second_index(index):
    index.delete_document('ticket', 'a')
    results = index.search('AX-42', k=2, filter={'owner_id': 'a'}, sparse_query='AX-42')
    assert [document.metadata['document_id'] for document in results] == ['general']


def test_large_owner_corpus_falls_back_to_dense_without_partial_keyword_scores(index, monkeypatch):
    monkeypatch.setattr(settings, 'retrieval_lexical_max_chunks', 1)
    results = index.search('AX-42', k=1, filter={'owner_id': 'a'}, sparse_query='AX-42')
    assert results[0].metadata['document_id'] == 'general'
