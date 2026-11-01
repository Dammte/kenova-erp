import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { GoogleGenerativeAI } from '@google/generative-ai';
import {
  READ_PROMPT,
  parseInvoice,
  type InvoiceFileType,
  type ReadInvoice,
} from './invoice-reader';

const UNREADABLE =
  'No hemos podido leer líneas en este archivo. Si es una foto, que se vea entera y sin reflejos. También puedes meter las líneas a mano.';

/** Design 3.4 step 1: the invoice's lines read with AI (Gemini). */
@Injectable()
export class InvoiceReaderService {
  private readonly genAI: GoogleGenerativeAI | null;

  constructor() {
    const key = process.env.GEMINI_API_KEY;
    this.genAI =
      key && key !== 'your_api_key_here' ? new GoogleGenerativeAI(key) : null;
  }

  async read(file: Buffer, type: InvoiceFileType): Promise<ReadInvoice> {
    if (!this.genAI) {
      throw new ServiceUnavailableException(
        'La lectura con IA no está configurada (falta GEMINI_API_KEY en el servidor). Puedes meter las líneas a mano.',
      );
    }
    const model = this.genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      generationConfig: { responseMimeType: 'application/json' },
    });
    let raw: string;
    try {
      const result = await model.generateContent([
        { inlineData: { mimeType: type, data: file.toString('base64') } },
        { text: READ_PROMPT },
      ]);
      raw = result.response.text();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/429|quota|RESOURCE_EXHAUSTED/.test(msg)) {
        throw new BadRequestException(
          'Se ha alcanzado el límite diario gratuito de lectura con IA. Inténtalo mañana o mete las líneas a mano.',
        );
      }
      if (/API_KEY|401|403/.test(msg)) {
        throw new ServiceUnavailableException(
          'La clave de la IA no es válida o ha caducado. Puedes meter las líneas a mano.',
        );
      }
      throw new BadRequestException(
        'No se ha podido contactar con la IA. Inténtalo de nuevo o mete las líneas a mano.',
      );
    }
    const read = parseInvoice(raw);
    if (!read || read.lines.length === 0) {
      throw new BadRequestException(UNREADABLE);
    }
    return read;
  }
}
