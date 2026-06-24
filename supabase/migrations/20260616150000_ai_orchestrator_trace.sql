-- AI Orchestrator: store per-message orchestration metadata
-- agents_used: хариуг бэлдэхэд оролцсон agent-уудын badge жагсаалт
-- trace: замчилагч + agent бүрийн алхам, latency, токен, ашигласан tool (observability)

ALTER TABLE ai_messages
    ADD COLUMN IF NOT EXISTS agents_used jsonb,
    ADD COLUMN IF NOT EXISTS trace jsonb;

COMMENT ON COLUMN ai_messages.agents_used IS 'Orchestrator: list of agent badges that produced this answer';
COMMENT ON COLUMN ai_messages.trace IS 'Orchestrator: full step-by-step execution trace (planner + agents + synthesis)';
