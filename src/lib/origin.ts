// Proteção contra requisições forjadas de outro site: o Origin precisa ser o próprio domínio da requisição.
// O domínio já foi validado como cadastrado ao resolver o cliente (ou a plataforma) pelo Host.
export function isSameOrigin(request: Request) {
  const origin = request.headers.get('origin');
  const host = request.headers.get('host');
  if (!origin || !host) return false;
  const scheme = process.env.NODE_ENV === 'production' ? 'https' : 'http';
  return origin.toLowerCase() === `${scheme}://${host.toLowerCase()}`;
}

// Endereço público do site que recebeu a requisição (usado em links de e-mail).
export function requestOrigin(headers: Headers) {
  const host = (headers.get('host') || '').toLowerCase();
  return `${process.env.NODE_ENV === 'production' ? 'https' : 'http'}://${host}`;
}
