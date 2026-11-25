import { hasPlatformAdmin, isPlatformHost, setupTokenIsValid } from '@/lib/admin-access';
import { isSameOrigin } from '@/lib/origin';
import { createPlatformAdmin } from '@/lib/platform';
import { platformError, platformJson, readJson, text } from '@/lib/platform-api';

// Primeiro acesso do dono da plataforma: só existe enquanto não houver nenhum superadmin e exige o ADMIN_SETUP_TOKEN.
export async function POST(request: Request) {
  if (!isPlatformHost(request.headers)) return platformError('Não encontrado.', 404);
  if (!isSameOrigin(request)) return platformError('Origem inválida.', 403);
  if (await hasPlatformAdmin()) return platformError('O administrador da plataforma já foi criado.', 409);
  const body = await readJson(request);
  const username = text(body?.username).toLowerCase();
  const email = text(body?.email).toLowerCase();
  const name = text(body?.name);
  const password = typeof body?.password === 'string' ? body.password : '';
  if (!setupTokenIsValid(text(body?.setupToken))) return platformError('Código inicial inválido.', 401);
  if (!/^[a-z0-9._-]{3,40}$/.test(username) || !/^\S+@\S+\.\S+$/.test(email) || name.length < 2 || password.length < 12) {
    return platformError('Informe nome, e-mail, usuário válido e senha com pelo menos 12 caracteres.');
  }
  try {
    await createPlatformAdmin({ username, email, name, password });
    return platformJson({ ok: true }, 201);
  } catch {
    return platformError('Não foi possível criar o administrador.', 409);
  }
}
