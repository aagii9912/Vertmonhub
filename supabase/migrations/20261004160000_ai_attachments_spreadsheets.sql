-- AI туслахад ERP/Excel экспорт хавсаргах (2026-10-04): ai-attachments bucket-д .xlsx/.csv/.tsv-г
-- нэмж зөвшөөрнө. Хувийн bucket, 4 MB хязгаар, серверийн шалгалт хэвээр. Идэмпотент.
UPDATE storage.buckets
SET allowed_mime_types = ARRAY[
    'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'text/csv', 'text/tab-separated-values'
]
WHERE id = 'ai-attachments';
