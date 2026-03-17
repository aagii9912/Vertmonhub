import { NextResponse } from 'next/server';

/**
 * Safe error response utility.
 * Returns a generic message to the client while logging the real error server-side.
 * Prevents internal error details from leaking to clients.
 */
export function safeErrorResponse(
    error: unknown,
    fallbackMessage: string = 'Серверт алдаа гарлаа',
    statusCode: number = 500
): NextResponse {
    // Log full error details server-side only
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const errorStack = error instanceof Error ? error.stack : undefined;
    console.error(`[API Error] ${fallbackMessage}:`, { message: errorMessage, stack: errorStack });

    // Return generic message to client
    return NextResponse.json(
        { error: fallbackMessage },
        { status: statusCode }
    );
}

/**
 * Safe error response with optional dev-mode details.
 * In development, includes error details for easier debugging.
 */
export function safeErrorResponseDev(
    error: unknown,
    fallbackMessage: string = 'Серверт алдаа гарлаа',
    statusCode: number = 500
): NextResponse {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[API Error] ${fallbackMessage}:`, error);

    const isDev = process.env.NODE_ENV === 'development';

    return NextResponse.json(
        {
            error: fallbackMessage,
            ...(isDev && { details: errorMessage }),
        },
        { status: statusCode }
    );
}
