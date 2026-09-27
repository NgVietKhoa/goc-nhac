-- Góc Nhạc: dữ liệu cá nhân.
-- Dùng schema riêng (không nằm trong "Exposed schemas" của PostgREST) nên anon key công khai
-- của Supabase không đọc/ghi được. Chỉ Edge Function (kết nối bằng SUPABASE_DB_URL) truy cập.

create schema if not exists goc_nhac;
revoke all on schema goc_nhac from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on schema goc_nhac from anon, authenticated';
  end if;
end $$;

-- Thông tin bài hát lưu lại để playlist/yêu thích/lịch sử hiện được mà không phải gọi YouTube.
create table if not exists goc_nhac.tracks (
  video_id     text primary key,
  title        text not null,
  artists      jsonb not null default '[]'::jsonb,   -- [{id, name}]
  album        jsonb,                                -- {id, name}
  duration_sec integer,
  thumbnail    text,
  updated_at   timestamptz not null default now()
);

create table if not exists goc_nhac.playlists (
  id          bigint generated always as identity primary key,
  name        text not null check (char_length(name) between 1 and 100),
  description text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists goc_nhac.playlist_tracks (
  playlist_id bigint not null references goc_nhac.playlists(id) on delete cascade,
  video_id    text   not null references goc_nhac.tracks(video_id),
  position    integer not null,
  added_at    timestamptz not null default now(),
  primary key (playlist_id, video_id)
);
create index if not exists playlist_tracks_order on goc_nhac.playlist_tracks (playlist_id, position);

create table if not exists goc_nhac.likes (
  video_id text primary key references goc_nhac.tracks(video_id),
  liked_at timestamptz not null default now()
);

create table if not exists goc_nhac.history (
  id           bigint generated always as identity primary key,
  video_id     text not null references goc_nhac.tracks(video_id),
  played_at    timestamptz not null default now(),
  listened_sec integer not null check (listened_sec >= 0)
);
create index if not exists history_played_at on goc_nhac.history (played_at desc);

-- Cache URL audio đã decipher (dùng chung giữa các instance Edge Function).
create table if not exists goc_nhac.stream_cache (
  cache_key      text primary key,             -- "<videoId>:<opus|m4a>"
  url            text not null,
  mime_type      text not null,
  content_length bigint,
  expires_at     timestamptz not null
);

-- Bộ đếm rate limit theo cửa sổ cố định.
create table if not exists goc_nhac.rate_limits (
  bucket       text primary key,
  window_start timestamptz not null,
  hits         integer not null
);

-- Chặn tuyệt đối truy cập qua API công khai, kể cả khi ai đó lỡ thêm schema vào "Exposed schemas".
alter table goc_nhac.tracks          enable row level security;
alter table goc_nhac.playlists       enable row level security;
alter table goc_nhac.playlist_tracks enable row level security;
alter table goc_nhac.likes           enable row level security;
alter table goc_nhac.history         enable row level security;
alter table goc_nhac.stream_cache    enable row level security;
alter table goc_nhac.rate_limits     enable row level security;
