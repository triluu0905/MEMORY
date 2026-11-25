CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY,
  email text NOT NULL UNIQUE,
  name text NOT NULL,
  lab text NOT NULL DEFAULT '',
  password_salt text NOT NULL,
  password_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE users ADD COLUMN IF NOT EXISTS language text NOT NULL DEFAULT 'vi';
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_language_check;
ALTER TABLE users ADD CONSTRAINT users_language_check CHECK (language IN ('vi', 'en'));
CREATE TABLE IF NOT EXISTS sessions (
  token_hash text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON sessions(user_id);
CREATE INDEX IF NOT EXISTS sessions_expires_at_idx ON sessions(expires_at);
CREATE TABLE IF NOT EXISTS password_reset_tokens (
  token_hash text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS password_reset_tokens_user_id_idx ON password_reset_tokens(user_id);
CREATE INDEX IF NOT EXISTS password_reset_tokens_expires_at_idx ON password_reset_tokens(expires_at);
CREATE TABLE IF NOT EXISTS workspaces (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  schema_version integer NOT NULL DEFAULT 1,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  revision bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS attachments (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name text NOT NULL,
  mime text NOT NULL,
  size_bytes bigint NOT NULL,
  stored_name text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS attachments_user_id_idx ON attachments(user_id);

-- A workspace is identified by its owner for backward compatibility with the
-- original one-workspace-per-user schema. Existing rows remain valid.
CREATE TABLE IF NOT EXISTS workspace_members (
  workspace_owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('owner', 'editor', 'viewer')),
  joined_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_owner_id, user_id)
);
CREATE INDEX IF NOT EXISTS workspace_members_user_id_idx ON workspace_members(user_id);

INSERT INTO workspace_members(workspace_owner_id, user_id, role)
SELECT id, id, 'owner' FROM users
ON CONFLICT (workspace_owner_id, user_id) DO NOTHING;

CREATE TABLE IF NOT EXISTS workspace_invitations (
  id uuid PRIMARY KEY,
  workspace_owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  email text NOT NULL,
  role text NOT NULL CHECK (role IN ('editor', 'viewer')),
  token_hash text NOT NULL UNIQUE,
  invited_by uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS workspace_invitations_workspace_idx ON workspace_invitations(workspace_owner_id);
CREATE INDEX IF NOT EXISTS workspace_invitations_email_idx ON workspace_invitations(email);

CREATE TABLE IF NOT EXISTS workspace_activities (
  id uuid PRIMARY KEY,
  workspace_owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES users(id) ON DELETE SET NULL,
  type text NOT NULL CHECK (type IN ('member_joined', 'member_left', 'member_removed')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS workspace_activities_workspace_idx ON workspace_activities(workspace_owner_id, created_at DESC);

CREATE TABLE IF NOT EXISTS sample_history (
  id uuid PRIMARY KEY,
  workspace_owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sample_id text NOT NULL,
  sample_code text NOT NULL,
  actor_id uuid REFERENCES users(id) ON DELETE SET NULL,
  actor_name text NOT NULL,
  type text NOT NULL CHECK (type IN ('created', 'edited', 'deleted')),
  changes jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sample_history_sample_idx ON sample_history(workspace_owner_id, sample_id, created_at DESC);
