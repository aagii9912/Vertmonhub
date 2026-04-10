import { type FunctionDeclaration, SchemaType } from '@google/generative-ai';

export interface ToolDefinition {
    name: string;
    description: string;
    parameters: {
        type: 'object';
        properties: Record<string, any>;
        required: string[];
    };
}

export function toSchemaType(type: string): SchemaType {
    switch (type) {
        case 'string': return SchemaType.STRING;
        case 'number': return SchemaType.NUMBER;
        case 'integer': return SchemaType.INTEGER;
        case 'boolean': return SchemaType.BOOLEAN;
        case 'array': return SchemaType.ARRAY;
        case 'object': return SchemaType.OBJECT;
        default: return SchemaType.STRING;
    }
}

export function getGeminiFunctionDeclarations(tools: ToolDefinition[]): FunctionDeclaration[] {
    return tools.map(tool => {
        const properties: Record<string, any> = {};

        for (const [key, prop] of Object.entries(tool.parameters.properties)) {
            const schemaProp: Record<string, unknown> = {
                type: toSchemaType(prop.type),
                description: prop.description,
            };
            if (prop.enum) schemaProp.enum = prop.enum;
            if (prop.items) schemaProp.items = { type: toSchemaType(prop.items.type) };
            properties[key] = schemaProp;
        }

        return {
            name: tool.name,
            description: tool.description,
            parameters: {
                type: SchemaType.OBJECT,
                properties,
                required: tool.parameters.required,
            },
        } as FunctionDeclaration;
    });
}
