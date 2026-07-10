import { describe, expect, it } from 'vitest';

import { isObviousPlaceholder, scanText } from './scan-secrets';

describe('secret scanner', () => {
  it('flags provider keys, JWTs, private keys, and literal credential assignments', () => {
    const providerKey = `sk-${'a'.repeat(32)}`;
    const jwt = [`eyJ${'a'.repeat(16)}`, 'b'.repeat(20), 'c'.repeat(20)].join('.');
    const privateKey = ['-----BEGIN ', 'PRIVATE KEY-----'].join('');
    const passwordAssignment = ['PAUSE_HEALTH_', 'PASSWORD=CorrectHorseBatteryStaple'].join('');
    const text = [providerKey, jwt, privateKey, passwordAssignment].join('\n');

    expect(scanText('unsafe.env', text).map(({ rule }) => rule)).toEqual([
      'provider_key',
      'jwt',
      'private_key',
      'credential_assignment',
    ]);
  });

  it('flags GitHub tokens without returning their values', () => {
    const token = ['ghp_', 'A'.repeat(36)].join('');

    const findings = scanText('unsafe.txt', token);
    expect(findings).toEqual([{ file: 'unsafe.txt', line: 1, rule: 'github_token' }]);
    expect(JSON.stringify(findings)).not.toContain(token);
  });

  it('allows placeholders and GitHub Actions secret references', () => {
    const safeExample = [
      'PAUSE_SUPABASE_ANON_KEY=your-anon-key',
      'PAUSE_HEALTH_PASSWORD=replace-me',
      'PAUSE_HEALTH_PASSWORD: ${{ secrets.PAUSE_HEALTH_PASSWORD }}',
      'QWEN_API_KEY=<set-locally>',
      'The repository secret is named PAUSE_SUPABASE_ANON_KEY.',
    ].join('\n');

    expect(scanText('.env.example', safeExample)).toEqual([]);
  });

  it('does not treat hashes or ordinary documentation as credentials', () => {
    const lockfileLike = JSON.stringify({
      integrity: `sha512-${'A'.repeat(96)}`,
      resolved: 'https://registry.npmjs.org/example/-/example-1.0.0.tgz',
    });

    expect(scanText('package-lock.json', lockfileLike)).toEqual([]);
    expect(scanText('README.md', 'Configure PAUSE_HEALTH_EMAIL and PAUSE_HEALTH_PASSWORD.')).toEqual([]);
  });

  it('never returns matched values in findings', () => {
    const value = `sk-${'z'.repeat(36)}`;
    const findings = scanText('unsafe.env', value);

    expect(findings).toEqual([{ file: 'unsafe.env', line: 1, rule: 'provider_key' }]);
    expect(JSON.stringify(findings)).not.toContain(value);
  });

  it('recognizes supported placeholder forms', () => {
    expect(isObviousPlaceholder('${PAUSE_SUPABASE_ANON_KEY}')).toBe(true);
    expect(isObviousPlaceholder('${{ secrets.PAUSE_HEALTH_PASSWORD }}')).toBe(true);
    expect(isObviousPlaceholder('process.env.PAUSE_HEALTH_PASSWORD')).toBe(true);
    expect(isObviousPlaceholder('actual-password-value')).toBe(false);
  });
});
