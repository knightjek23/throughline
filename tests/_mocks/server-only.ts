// Empty stub. Vitest aliases the real `server-only` package to this file so
// `import 'server-only'` is a no-op in tests. The real package throws when
// imported outside of a React Server Component, which breaks unit tests.
export {};
