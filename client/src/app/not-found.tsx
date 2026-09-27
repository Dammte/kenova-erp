'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import errorIllustration from '../../public/404.svg';
import { Undo2 } from 'lucide-react';

export default function NotFound() {
  const router = useRouter();

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 px-4">
      <div className="max-w-md text-center">
        <Image
          src={errorIllustration}
          alt="Página no encontrada"
          width={300}
          height={300}
          className="mx-auto mb-8"
        />
        <h1 className="text-5xl font-bold text-gray-800 mb-4">404</h1>
        <p className="text-lg text-gray-600 mb-6">
          ¡Vaya! La página que buscas no existe o ha sido movida.
        </p>
        <div className="flex justify-center gap-4">
          <button
            onClick={() => router.back()}
            className="px-6 py-3 bg-blue-600 text-white font-semibold rounded-lg shadow-md hover:bg-blue-700 transition"
          >
            <Undo2> Volver atras </Undo2>
          </button>
          <Link
            href="/contact"
            className="px-6 py-3 border border-blue-600 text-blue-600 font-semibold rounded-lg shadow-md hover:bg-blue-50 transition"
          >
            Contactar soporte
          </Link>
        </div>
      </div>
    </div>
  );
}