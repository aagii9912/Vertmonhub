-- Уулзалт (meeting) хэсэг — Давалгаа 2
-- Зорилго: байр сонгохгүйгээр (оффисын зөвлөгөө / ерөнхий уулзалт) бүртгэх боломж.
--
-- Өмнө нь property_viewings.property_id нь NOT NULL байсан тул уулзалт бүр
-- заавал тодорхой нэгжтэй холбогдох шаардлагатай байв. Эзний шийдвэрээр
-- (2026-06-30) байргүй уулзалтыг зөвшөөрнө.
--
-- meeting_monthly_summary VIEW нь аль хэдийн LEFT JOIN ашигладаг тул
-- property_id NULL мөрүүдэд нөлөөгүй.

ALTER TABLE property_viewings ALTER COLUMN property_id DROP NOT NULL;
