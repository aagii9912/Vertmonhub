/**
 * OpenAPI/Swagger Documentation Endpoint
 * Auto-generated API documentation
 */

import { NextResponse } from 'next/server';

const OPENAPI_SPEC = {
    openapi: '3.0.3',
    info: {
        title: 'Syncly API',
        description: 'AI-powered e-commerce platform API',
        version: '1.0.0',
        contact: {
            email: 'support@smarthub.mn'
        }
    },
    servers: [
        {
            url: process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
            description: 'Current environment'
        }
    ],
    tags: [
        { name: 'Health', description: 'System health checks' },
        { name: 'Chat', description: 'AI chat endpoints' },
        { name: 'Orders', description: 'Order management' },
        { name: 'Products', description: 'Product management' },
        { name: 'Customers', description: 'Customer management' },
        { name: 'Cart', description: 'Shopping cart operations' },
        { name: 'Subscription', description: 'Subscription management' },
        { name: 'Webhooks', description: 'External service webhooks' }
    ],
    paths: {
        '/api/health': {
            get: {
                tags: ['Health'],
                summary: 'Health check',
                description: 'Returns system health status for monitoring',
                responses: {
                    '200': {
                        description: 'System is healthy',
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'object',
                                    properties: {
                                        status: { type: 'string', enum: ['healthy', 'degraded', 'unhealthy'] },
                                        timestamp: { type: 'string', format: 'date-time' },
                                        version: { type: 'string' },
                                        uptime: { type: 'number' }
                                    }
                                }
                            }
                        }
                    },
                    '503': { description: 'System is unhealthy' }
                }
            }
        },
        '/api/chat': {
            post: {
                tags: ['Chat'],
                summary: 'Send chat message',
                description: 'Send a message to the AI chatbot and get a response',
                security: [{ bearerAuth: [] }],
                requestBody: {
                    required: true,
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                required: ['message', 'shopId'],
                                properties: {
                                    message: { type: 'string', description: 'User message' },
                                    shopId: { type: 'string', format: 'uuid' },
                                    customerId: { type: 'string', format: 'uuid' },
                                    history: { type: 'array', items: { type: 'object' } }
                                }
                            }
                        }
                    }
                },
                responses: {
                    '200': {
                        description: 'Chat response',
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'object',
                                    properties: {
                                        text: { type: 'string' },
                                        imageAction: { type: 'object' }
                                    }
                                }
                            }
                        }
                    },
                    '429': { description: 'Rate limit exceeded' }
                }
            }
        },
        '/api/orders': {
            get: {
                tags: ['Orders'],
                summary: 'List orders',
                security: [{ bearerAuth: [] }],
                parameters: [
                    { name: 'status', in: 'query', schema: { type: 'string' } },
                    { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
                    { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 } }
                ],
                responses: {
                    '200': { description: 'List of orders' },
                    '401': { description: 'Unauthorized' }
                }
            }
        },
        '/api/dashboard/products': {
            get: {
                tags: ['Products'],
                summary: 'List products',
                security: [{ bearerAuth: [] }],
                responses: {
                    '200': { description: 'List of products' }
                }
            },
            post: {
                tags: ['Products'],
                summary: 'Create product',
                security: [{ bearerAuth: [] }],
                requestBody: {
                    required: true,
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                required: ['name', 'price'],
                                properties: {
                                    name: { type: 'string' },
                                    price: { type: 'number' },
                                    stock: { type: 'integer' },
                                    description: { type: 'string' }
                                }
                            }
                        }
                    }
                },
                responses: {
                    '201': { description: 'Product created' },
                    '400': { description: 'Validation error' }
                }
            }
        },
        '/api/dashboard/customers': {
            get: {
                tags: ['Customers'],
                summary: 'List customers',
                security: [{ bearerAuth: [] }],
                parameters: [
                    { name: 'search', in: 'query', schema: { type: 'string' } },
                    { name: 'sortBy', in: 'query', schema: { type: 'string' } }
                ],
                responses: {
                    '200': { description: 'List of customers' }
                }
            }
        },
        '/api/cart': {
            get: {
                tags: ['Cart'],
                summary: 'Get cart contents',
                security: [{ bearerAuth: [] }],
                responses: {
                    '200': { description: 'Cart contents' }
                }
            },
            post: {
                tags: ['Cart'],
                summary: 'Add item to cart',
                security: [{ bearerAuth: [] }],
                requestBody: {
                    required: true,
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                required: ['productId', 'quantity'],
                                properties: {
                                    productId: { type: 'string', format: 'uuid' },
                                    quantity: { type: 'integer', minimum: 1 }
                                }
                            }
                        }
                    }
                },
                responses: {
                    '200': { description: 'Item added' }
                }
            }
        },
        '/api/webhook': {
            post: {
                tags: ['Webhooks'],
                summary: 'Facebook Messenger webhook',
                description: 'Receives messages from Facebook Messenger',
                responses: {
                    '200': { description: 'Webhook processed' }
                }
            }
        }
    },
    components: {
        securitySchemes: {
            bearerAuth: {
                type: 'http',
                scheme: 'bearer',
                bearerFormat: 'JWT',
                description: 'Clerk JWT token'
            }
        },
        schemas: {
            Error: {
                type: 'object',
                properties: {
                    error: { type: 'string' },
                    message: { type: 'string' }
                }
            },
            RateLimitError: {
                type: 'object',
                properties: {
                    error: { type: 'string', example: 'Too Many Requests' },
                    retryAfter: { type: 'integer' }
                }
            }
        }
    }
};

export async function GET() {
    return NextResponse.json(OPENAPI_SPEC, {
        headers: {
            'Content-Type': 'application/json',
        }
    });
}
