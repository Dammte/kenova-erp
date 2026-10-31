import { BASE_TEMPLATES, templateProblem } from './templates';

describe('templateProblem', () => {
  it('accepts every base text', () => {
    for (const { body } of Object.values(BASE_TEMPLATES)) {
      expect(templateProblem(body)).toBeNull();
    }
  });

  it('names the unknown variable and suggests the right one', () => {
    expect(templateProblem('Te cuesta {precio}')).toBe(
      'La variable {precio} no existe. Usa {saldo} para el importe pendiente.',
    );
    expect(templateProblem('Hola {Cliente}')).toContain('Usa {nombre}');
    expect(templateProblem('Hola {xyz}')).toContain(
      'Puedes usar {nombre} {modelo} {orden} {total} {saldo} {tienda}',
    );
  });

  it('checks the [si …] blocks', () => {
    expect(templateProblem('Hola[si saldo] debes {saldo}[/si].')).toBeNull();
    expect(templateProblem('[si saldo] debes')).toContain('Falta cerrar');
    expect(templateProblem('debes[/si]')).toContain('sin su [si');
    expect(templateProblem('[si saldo][si total]x[/si][/si]')).toContain(
      'antes de abrir otro',
    );
    expect(templateProblem('[si precio]x[/si]')).toContain('Usa {saldo}');
    expect(templateProblem('[si]x[/si]')).toContain('[si saldo]');
  });

  it('refuses empty and overlong texts', () => {
    expect(templateProblem('  ')).toBe('Escribe el texto del aviso.');
    expect(templateProblem('a'.repeat(2001))).toContain('2000');
  });
});
