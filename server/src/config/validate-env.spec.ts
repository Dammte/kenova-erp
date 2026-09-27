import { productionEnvProblems } from './validate-env';

const complete = {
  NODE_ENV: 'production',
  DATABASE_URL: 'postgres://u:p@h:5432/db',
  DEVICE_SECRET_KEY: 'x'.repeat(44),
  CORS_ORIGIN: 'https://app.example.test',
};

describe('productionEnvProblems', () => {
  it('ignores local development and tests', () => {
    expect(productionEnvProblems({ NODE_ENV: 'test' })).toEqual([]);
    expect(productionEnvProblems({})).toEqual([]);
  });

  it('accepts a complete production configuration', () => {
    expect(productionEnvProblems(complete)).toEqual([]);
    const { DATABASE_URL, ...withDbHost } = complete;
    expect(productionEnvProblems({ ...withDbHost, DB_HOST: 'db' })).toEqual([]);
  });

  it('lists every missing variable at once', () => {
    const problems = productionEnvProblems({ NODE_ENV: 'production' });
    expect(problems).toHaveLength(3);
    expect(problems.join()).toMatch(
      /DATABASE_URL.*DEVICE_SECRET_KEY.*CORS_ORIGIN/,
    );
  });

  it('on Render, requires NODE_ENV=production', () => {
    const { NODE_ENV, ...rest } = complete;
    expect(productionEnvProblems({ ...rest, RENDER: 'true' })).toEqual([
      'NODE_ENV must be "production"',
    ]);
  });
});
