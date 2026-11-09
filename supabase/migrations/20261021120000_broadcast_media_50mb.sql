-- Ficheiros das mensagens até 50 MB (#187): o fileSizeMb dos planos é 50 e
-- o bucket ficava nos 20. 50 MB é também o máximo do plano Free do Supabase
-- (Storage → Settings → Global file size limit), que nenhum bucket pode passar.
-- Só muda o broadcast-media: o images (5 MB) e o assistant-uploads (20 MB)
-- ficam como estão.
-- Correr no SQL Editor do Supabase ANTES do deploy. Pode ser corrido mais de
-- uma vez.

update storage.buckets
set file_size_limit = 52428800
where id = 'broadcast-media';
