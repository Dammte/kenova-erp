import { applyDecorators } from '@nestjs/common';
import { Transform, Type } from 'class-transformer';
import { load } from 'cheerio';
import {
  Equals,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Validate,
  ValidateNested,
  ValidatorConstraint,
  type ValidatorConstraintInterface,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;
const emptyToNull = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() || null : value;

/** https://host[:port] with nothing after it: the pages go apart. */
const BASE_URL =
  /^https:\/\/[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+(:\d{2,5})?$/i;
/** /a/b?c=d — a page on that host, never another address. */
const PATH = /^\/(?!\/)[^\s\\]*$/;
const NO_DOTS = /^(?!.*(^|\/)\.\.?(\/|\?|$))/;
/** The name of a form input: email, customer[email]… */
const INPUT_NAME = /^[A-Za-z0-9_$.[\]-]+$/;

@ValidatorConstraint({ name: 'cssSelector' })
class CssSelector implements ValidatorConstraintInterface {
  private readonly $ = load('<p></p>');
  validate(value: unknown) {
    if (typeof value !== 'string' || !value) return false;
    try {
      this.$(value);
      return true;
    } catch {
      return false;
    }
  }
  defaultMessage() {
    return 'no es un selector válido';
  }
}

@ValidatorConstraint({ name: 'idPattern' })
/** A regular expression with exactly one group. */
class IdPattern implements ValidatorConstraintInterface {
  validate(value: unknown) {
    if (typeof value !== 'string') return false;
    try {
      return new RegExp(`${value}|`).exec('')!.length === 2;
    } catch {
      return false;
    }
  }
  defaultMessage() {
    return 'Patrón del id: una expresión con un solo grupo, por ejemplo id_order=(\\d+)';
  }
}

const Page = (label: string) =>
  applyDecorators(
    Transform(trim),
    IsString(),
    MaxLength(300),
    Matches(PATH, { message: `${label}: debe empezar por /` }),
    Matches(NO_DOTS, { message: `${label}: no puede llevar «..»` }),
  );
const Input = (label: string) =>
  applyDecorators(
    Transform(trim),
    IsString(),
    MaxLength(60),
    Matches(INPUT_NAME, { message: `${label}: escribe el nombre del campo` }),
  );
const Selector = (label: string) =>
  applyDecorators(
    Transform(trim),
    IsString(),
    MaxLength(200),
    Validate(CssSelector, { message: `${label}: no es un selector válido` }),
  );
/** Left empty, it is saved as null. */
const Optional = (inner: PropertyDecorator) =>
  applyDecorators(Transform(emptyToNull), IsOptional(), inner);

export class LoginDto {
  @Page('Página de inicio de sesión')
  path: string;

  @Input('Campo del usuario')
  userField: string;

  @Input('Campo de la contraseña')
  passwordField: string;
}

export class HistoryDto {
  @Page('Página del historial')
  path: string;

  @Selector('Filas del historial')
  rowSelector: string;

  @Selector('Referencia')
  referenceSelector: string;

  @Selector('Fecha')
  dateSelector: string;

  @Selector('Total')
  totalSelector: string;

  @Optional(Selector('Pago'))
  paymentSelector: string | null;

  @Optional(Selector('Estado'))
  statusSelector: string | null;

  @Optional(Selector('Enlace a la factura'))
  invoiceLinkSelector: string | null;

  @Selector('Enlace al pedido')
  detailLinkSelector: string;

  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'Indica el patrón del id' })
  @MaxLength(100)
  @Validate(IdPattern)
  idPattern: string;
}

export class DetailDto {
  @Page('Página del pedido')
  @Matches(/\{id\}/, { message: 'Página del pedido: tiene que llevar {id}' })
  path: string;

  @Selector('Filas del pedido')
  rowSelector: string;

  @Selector('Producto')
  productSelector: string;

  @Optional(Selector('Referencia del producto'))
  refSelector: string | null;

  @Transform(emptyToNull)
  @IsOptional()
  @IsString()
  @MaxLength(100)
  @Validate(IdPattern, {
    message:
      'Patrón de la referencia: una expresión con un solo grupo, por ejemplo Referencia:\\s*(\\S+)',
  })
  refPattern: string | null;

  @Optional(Selector('Enlace al producto'))
  productLinkSelector: string | null;

  @Transform(emptyToNull)
  @IsOptional()
  @Page('Búsqueda del producto')
  @Matches(/\{ref\}/, {
    message: 'Búsqueda del producto: tiene que llevar {ref}',
  })
  productSearchPath: string | null;

  @Selector('Cantidad')
  quantitySelector: string;

  @Selector('Precio unitario')
  unitPriceSelector: string;

  @Optional(Selector('Precio total'))
  lineTotalSelector: string | null;
}

export class SupplierConnectionDto {
  @Equals('html', { message: 'Tipo de conexión no válido' })
  kind: 'html';

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().replace(/\/+$/, '') : value,
  )
  @IsString()
  @MaxLength(200)
  @Matches(BASE_URL, {
    message:
      'Dirección base: solo https:// y el dominio, sin rutas (https://b2b.proveedor.es)',
  })
  baseUrl: string;

  @ValidateNested()
  @Type(() => LoginDto)
  login: LoginDto;

  @ValidateNested()
  @Type(() => HistoryDto)
  history: HistoryDto;

  @ValidateNested()
  @Type(() => DetailDto)
  detail: DetailDto;
}

export class SupplierCredentialsDto {
  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'Escribe el usuario' })
  @MaxLength(150)
  username: string;

  @IsString()
  @IsNotEmpty({ message: 'Escribe la contraseña' })
  @MaxLength(200)
  password: string;
}
