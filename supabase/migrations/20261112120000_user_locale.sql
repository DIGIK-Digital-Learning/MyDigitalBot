-- #241: a língua em que o bot fala com cada colaborador.
--
-- O bot começa na língua da organização (organization.locale, a escolhida no
-- topo do site). Quando o colaborador escreve claramente noutra língua (pt ou
-- en), fica guardada aqui e o bot passa a responder nessa. null = ainda não
-- escreveu nada claro, usa-se a da organização.
--
-- Correr no SQL Editor do Supabase ANTES do deploy. Pode ser corrido mais de
-- uma vez. O código aguenta a coluna ainda não existir (usa a língua da
-- organização), mas só guarda a do colaborador depois disto.

alter table public."user"
  add column if not exists locale text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public."user"'::regclass
      and conname = 'user_locale_check'
  ) then
    alter table public."user"
      add constraint user_locale_check
      check (locale is null or locale in ('pt', 'en'));
  end if;
end $$;
