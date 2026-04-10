import { describe, it, expect } from 'vitest';
import { AI_TOOLS } from '../tools/definitions';
import type {
    CreateOrderArgs,
    CollectContactArgs,
    AddToCartArgs,
    ShowProductImageArgs,
} from '../tools/definitions';

// Helper to access function tool properties (schema changed, now tools are flat)
const getToolFunction = (tool: any) => tool;

describe('AI Tool Definitions', () => {
    describe('AI_TOOLS array', () => {
        it('contains all expected tools', () => {
            const toolNames = AI_TOOLS.map(t => getToolFunction(t).name);

            expect(toolNames).toContain('create_order');
            expect(toolNames).toContain('collect_contact_info');
            expect(toolNames).toContain('request_human_support');
            expect(toolNames).toContain('cancel_order');
            expect(toolNames).toContain('show_product_image');
            expect(toolNames).toContain('add_to_cart');
            expect(toolNames).toContain('view_cart');
            expect(toolNames).toContain('remove_from_cart');
            expect(toolNames).toContain('checkout');
        });

        it('has correct count of tools', () => {
            expect(AI_TOOLS.length).toBe(15);
        });

        it('all tools have name and description', () => {
            AI_TOOLS.forEach(tool => {
                const fn = getToolFunction(tool);
                expect(fn.name).toBeDefined();
                expect(fn.name.length).toBeGreaterThan(0);
                expect(fn.description).toBeDefined();
                expect(fn.description.length).toBeGreaterThan(10);
            });
        });

        it('all tools have parameters object', () => {
            AI_TOOLS.forEach(tool => {
                const fn = getToolFunction(tool);
                expect(fn.parameters).toBeDefined();
                expect(fn.parameters.type).toBe('object');
            });
        });
    });

    describe('create_order tool', () => {
        const createOrderTool = AI_TOOLS.find(t => getToolFunction(t).name === 'create_order');

        it('has required parameters defined', () => {
            expect(createOrderTool).toBeDefined();
            const params = getToolFunction(createOrderTool).parameters;
            expect(params.required).toContain('product_name');
            expect(params.required).toContain('quantity');
        });

        it('has product_name and quantity properties', () => {
            const props = getToolFunction(createOrderTool).parameters.properties;
            expect(props.product_name.type).toBe('string');
            expect(props.quantity.type).toBe('number');
        });

        it('has optional color and size', () => {
            const props = getToolFunction(createOrderTool).parameters.properties;
            expect(props.color).toBeDefined();
            expect(props.size).toBeDefined();
        });
    });

    describe('add_to_cart tool', () => {
        const addToCartTool = AI_TOOLS.find(t => getToolFunction(t).name === 'add_to_cart');

        it('has product_name as required', () => {
            expect(addToCartTool).toBeDefined();
            expect(getToolFunction(addToCartTool).parameters.required).toContain('product_name');
        });

        it('has quantity as optional with default', () => {
            const props = getToolFunction(addToCartTool).parameters.properties;
            expect(props.quantity.default).toBe(1);
        });
    });

    describe('show_product_image tool', () => {
        const showImageTool = AI_TOOLS.find(t => getToolFunction(t).name === 'show_product_image');

        it('has required parameters', () => {
            expect(showImageTool).toBeDefined();
            const params = getToolFunction(showImageTool).parameters;
            expect(params.required).toContain('product_names');
            expect(params.required).toContain('mode');
        });

        it('has array type for product_names', () => {
            const props = getToolFunction(showImageTool).parameters.properties;
            expect(props.product_names.type).toBe('array');
            expect(props.product_names.items?.type).toBe('string');
        });

        it('has enum for mode', () => {
            const props = getToolFunction(showImageTool).parameters.properties;
            expect(props.mode.enum).toContain('single');
            expect(props.mode.enum).toContain('confirm');
        });
    });

    describe('checkout tool', () => {
        const checkoutTool = AI_TOOLS.find(t => getToolFunction(t).name === 'checkout');

        it('has no required parameters', () => {
            expect(checkoutTool).toBeDefined();
            expect(getToolFunction(checkoutTool).parameters.required).toEqual([]);
        });
    });

    describe('Type exports', () => {
        it('CreateOrderArgs has correct shape', () => {
            const args: CreateOrderArgs = {
                product_name: 'Test',
                quantity: 1,
            };
            expect(args.product_name).toBe('Test');
            expect(args.quantity).toBe(1);
        });

        it('CollectContactArgs allows all optional', () => {
            const args: CollectContactArgs = {};
            expect(args.phone).toBeUndefined();
        });

        it('AddToCartArgs requires product_name', () => {
            const args: AddToCartArgs = {
                product_name: 'Test',
            };
            expect(args.product_name).toBe('Test');
        });

        it('ShowProductImageArgs has correct shape', () => {
            const args: ShowProductImageArgs = {
                product_names: ['A', 'B'],
                mode: 'confirm',
            };
            expect(args.product_names.length).toBe(2);
            expect(args.mode).toBe('confirm');
        });
    });
});
