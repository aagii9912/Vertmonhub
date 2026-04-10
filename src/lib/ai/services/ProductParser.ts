/**
 * AI-powered product data parser using Gemini
 * Extracts structured product data from file content (xlsx, docx, csv)
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import { logger } from '@/lib/utils/logger';

export interface AIExtractedProduct {
    name: string;
    price: number;
    stock: number;
    description: string;
    type: 'physical' | 'service';
    unit: string;
    colors: string[];
    sizes: string[];
}

/**
 * Parse product data from file content using Gemini
 */
export async function parseProductDataWithAI(
    fileContent: string,
    fileName: string
): Promise<AIExtractedProduct[]> {
    try {
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            logger.error('GEMINI_API_KEY not configured for product parsing');
            return [];
        }

        logger.info('Parsing product data with Gemini...', { fileName, contentLength: fileContent.length });

        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({
            model: 'gemini-3.1-flash-lite-preview',
            generationConfig: {
                responseMimeType: 'application/json',
            },
        });

        const prompt = `You are a data extraction assistant. Extract products and services from the provided file content.
Filename: "${fileName}"

RULES:
1. Extract ALL items found.
2. Determine 'type': 'physical' for physical goods (phones, clothes), 'service' for services (repair, editing, consulting).
3. Determine 'unit': e.g., 'ширхэг' for goods, 'захиалга', 'цаг', 'хүн' for services.
4. Extract 'stock': For services, this is the Number of Available Slots/Orders. If not specified, default to 0.
5. Extract 'colors' and 'sizes' if available.
6. Return a JSON object with a "products" array.

Input Content:
${fileContent.slice(0, 15000)}

Response Format (JSON only):
{
  "products": [
    {
      "name": "Product Name",
      "price": 0,
      "stock": 0,
      "description": "Description",
      "type": "physical",
      "unit": "ширхэг",
      "colors": ["red", "blue"],
      "sizes": ["S", "M"]
    }
  ]
}`;

        const result = await model.generateContent(prompt);
        const content = result.response.text();
        const parsed = JSON.parse(content);

        if (!Array.isArray(parsed.products)) {
            logger.warn('Gemini returned invalid format', { parsed });
            return [];
        }

        return parsed.products.map((p: any) => ({
            name: p.name || 'Unnamed',
            price: Number(p.price) || 0,
            stock: Number(p.stock) || 0,
            description: p.description || '',
            type: p.type === 'service' ? 'service' : 'physical',
            unit: p.unit || (p.type === 'service' ? 'захиалга' : 'ширхэг'),
            colors: Array.isArray(p.colors) ? p.colors : [],
            sizes: Array.isArray(p.sizes) ? p.sizes : [],
        }));

    } catch (error: unknown) {
        logger.error('Gemini Parse Error:', { message: error instanceof Error ? error.message : String(error) });
        return [];
    }
}
