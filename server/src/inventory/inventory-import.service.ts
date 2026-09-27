import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { GoogleGenerativeAI } from '@google/generative-ai';

export interface ParsedInventoryItem {
  name: string;
  quantity: number;
  unitPrice: number;
  sku: string | null;
  brand: string | null;
  description: string | null;
  category: string | null;
}

// Categories the frontend knows about
const KNOWN_CATEGORIES = [
  'Filtros',
  'Frenos',
  'Motor',
  'Transmisión',
  'Electricidad',
  'Lubricantes',
  'Carrocería',
  'Suspensión',
  'Refrigeración',
  'Neumáticos',
  'Otros',
];

const EXTRACTION_PROMPT = `Eres un sistema especializado en análisis de facturas de talleres electronicos.

Analiza el documento adjunto (factura, albarán o pedido de compra) y extrae todos los productos físicos.

Devuelve SOLO un array JSON. Sin texto extra, sin markdown, sin explicaciones.
Formato exacto de cada elemento:
{"name":"<nombre>","quantity":<número>,"unitPrice":<número>,"sku":"<código o null>","brand":"<marca o null>","description":"<detalle o null>","category":"<categoría o null>"}

Reglas estrictas:
1. Incluye SOLO repuestos y materiales físicos. Excluye: mano de obra, IVA, descuentos, gastos de envío, subtotales, totales.
2. "unitPrice" es el precio POR UNIDAD, nunca el total de línea. Si solo hay total de línea: unitPrice = totalLinea / quantity.
3. Convierte números europeos: "1.234,56" → 1234.56
4. "category" usa solo estos valores: ${KNOWN_CATEGORIES.join(', ')}.
5. "sku" solo si hay un código de referencia o número de pieza claro; si no, usa null.
6. Si el mismo producto aparece en varias filas, suma las cantidades.
7. Si no hay productos, devuelve: []`;

@Injectable()
export class InventoryImportService {
  private readonly genAI: GoogleGenerativeAI | null = null;

  constructor() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (apiKey && apiKey !== 'your_api_key_here') {
      this.genAI = new GoogleGenerativeAI(apiKey);
    }
  }

  async analyzeInvoice(pdfBuffer: Buffer): Promise<ParsedInventoryItem[]> {
    if (!this.genAI) {
      throw new ServiceUnavailableException(
        'El servicio de análisis IA no está configurado. ' +
          'Establece GEMINI_API_KEY en el archivo .env del servidor. ' +
          'Clave gratuita en: https://aistudio.google.com/apikey',
      );
    }

    // gemini-2.5-flash: supports PDFs natively (text + scanned), generous free tier
    const model = this.genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

    let raw: string;
    try {
      const result = await model.generateContent([
        {
          inlineData: {
            mimeType: 'application/pdf',
            data: pdfBuffer.toString('base64'),
          },
        },
        { text: EXTRACTION_PROMPT },
      ]);
      raw = result.response.text();
    } catch (err: any) {
      const msg: string = err?.message ?? 'error desconocido';

      if (
        msg.includes('429') ||
        msg.includes('quota') ||
        msg.includes('RESOURCE_EXHAUSTED')
      ) {
        throw new BadRequestException(
          'Se ha alcanzado el límite de solicitudes gratuitas. ' +
            'El límite se restablece a diario. Inténtalo más tarde.',
        );
      }
      if (
        msg.includes('API_KEY') ||
        msg.includes('403') ||
        msg.includes('401')
      ) {
        throw new ServiceUnavailableException(
          'La clave de API de Gemini no es válida o ha expirado. ' +
            'Genera una nueva en https://aistudio.google.com/apikey',
        );
      }

      throw new BadRequestException(
        `Error al contactar con el analizador IA: ${msg}`,
      );
    }

    return this.parseResponse(raw);
  }

  private parseResponse(raw: string): ParsedInventoryItem[] {
    // Strip markdown code fences that the model may include despite instructions
    const cleaned = raw
      .trim()
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/, '')
      .trim();

    let items: any[];
    try {
      items = JSON.parse(cleaned);
      if (!Array.isArray(items))
        throw new Error('response is not a JSON array');
    } catch {
      throw new BadRequestException(
        'No se pudo interpretar la respuesta del analizador. ' +
          'El documento puede no contener productos legibles o ser de un formato no soportado.',
      );
    }

    return items
      .map((item: any) => ({
        name: String(item.name ?? '').trim(),
        quantity: Math.max(1, Math.round(Number(item.quantity) || 1)),
        unitPrice: Math.max(
          0,
          parseFloat(Number(item.unitPrice).toFixed(4)) || 0,
        ),
        sku: item.sku ? String(item.sku).trim().substring(0, 20) : null,
        brand: item.brand ? String(item.brand).trim().substring(0, 50) : null,
        description: item.description
          ? String(item.description).trim().substring(0, 150)
          : null,
        category: KNOWN_CATEGORIES.includes(item.category)
          ? String(item.category).trim()
          : null,
      }))
      .filter((item) => item.name.length > 0);
  }
}
