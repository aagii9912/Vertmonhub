-- AI туслах v3: урт ярианы хураангуй (санах ой) + гүйцэтгэсэн үйлдлийн тэмдэглэл
alter table public.ai_conversations
    add column if not exists summary text,
    add column if not exists summary_message_count integer not null default 0;

comment on column public.ai_conversations.summary is 'Ярианы өмнөх хэсгийн AI хураангуй (сүүлийн мессежүүд шууд контекстод явна)';
comment on column public.ai_conversations.summary_message_count is 'Хураангуйд орсон мессежийн тоо (created_at дарааллаар)';
