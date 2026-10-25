import { nativeNodeFetchIntegration } from '@sentry/nextjs';
import { isMetaGraphUrl } from './sentry-meta';

/**
 * Node runtime-ийн Sentry интеграц: Meta Graph руу хийсэн fetch-ийг span, breadcrumb-д огт бичихгүй — URL-д
 * `appsecret_proof`, debug_token-ий `input_token` (хэрэглэгчийн токен) байдаг. Зөвхөн instrumentation-ийн nodejs
 * салаанаас динамикаар ачаална (edge build энэ интеграцийг экспортлодоггүй).
 */
export const nodeSentryIntegrations = () => [nativeNodeFetchIntegration({ ignoreOutgoingRequests: isMetaGraphUrl })];
