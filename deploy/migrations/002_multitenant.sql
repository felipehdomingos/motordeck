-- Multi-cliente: cada dado passa a pertencer a um tenant, resolvido pelo domínio.
CREATE TABLE public.tenants (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$'),
  name TEXT NOT NULL CHECK (char_length(name) BETWEEN 2 AND 120),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
  settings JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(settings) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.tenant_domains (
  host TEXT PRIMARY KEY CHECK (host = lower(host) AND host !~ '[/:\s]'),
  tenant_id TEXT NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX tenant_domains_tenant_idx ON public.tenant_domains (tenant_id);

-- O cliente que já existe (Mesquiatti) vira o primeiro tenant e herda todos os dados.
INSERT INTO public.tenants (id, slug, name) VALUES ('mesquiatti', 'mesquiatti', 'Bruno Mesquiatti');

ALTER TABLE public.mesquiatti_vehicles RENAME TO vehicles;
ALTER INDEX public.mesquiatti_vehicles_created_at_idx RENAME TO vehicles_created_at_idx;
ALTER TABLE public.vehicles ADD COLUMN tenant_id TEXT;
UPDATE public.vehicles SET tenant_id = 'mesquiatti';
ALTER TABLE public.vehicles ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE public.vehicles ADD CONSTRAINT vehicles_tenant_fk FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;
ALTER TABLE public.vehicles DROP CONSTRAINT mesquiatti_vehicles_pkey;
ALTER TABLE public.vehicles ADD CONSTRAINT vehicles_pkey PRIMARY KEY (tenant_id, slug);
DROP INDEX public.vehicles_created_at_idx;
CREATE INDEX vehicles_tenant_created_idx ON public.vehicles (tenant_id, created_at DESC, slug ASC);

-- tenant_id NULL = administrador da plataforma (você); só vale no domínio da plataforma.
ALTER TABLE public.admin_users ADD COLUMN tenant_id TEXT REFERENCES public.tenants(id) ON DELETE CASCADE;
UPDATE public.admin_users SET tenant_id = 'mesquiatti';
ALTER TABLE public.admin_users DROP CONSTRAINT admin_users_username_key;
ALTER TABLE public.admin_users DROP CONSTRAINT admin_users_email_key;
ALTER TABLE public.admin_users DROP CONSTRAINT admin_users_role_check;
ALTER TABLE public.admin_users ADD CONSTRAINT admin_users_role_check CHECK (role IN ('superadmin', 'owner', 'admin', 'editor', 'viewer'));
ALTER TABLE public.admin_users ADD CONSTRAINT admin_users_scope_check CHECK ((role = 'superadmin') = (tenant_id IS NULL));
CREATE UNIQUE INDEX admin_users_tenant_username_key ON public.admin_users (COALESCE(tenant_id, ''), username);
CREATE UNIQUE INDEX admin_users_tenant_email_key ON public.admin_users (COALESCE(tenant_id, ''), email);
CREATE INDEX admin_users_tenant_idx ON public.admin_users (tenant_id);
