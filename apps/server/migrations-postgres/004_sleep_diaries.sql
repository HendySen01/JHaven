CREATE TABLE jhaven.sleep_diaries (
  id uuid PRIMARY KEY,
  user_id bigint NOT NULL REFERENCES jhaven.users (id) ON DELETE CASCADE,
  entry_date date NOT NULL,
  timezone varchar(64) NOT NULL,
  bedtime timestamptz(0),
  asleep timestamptz(0),
  wake timestamptz(0),
  rest smallint CHECK (rest BETWEEN 1 AND 5),
  note varchar(2000) NOT NULL,
  CONSTRAINT uq_diaries_user_date UNIQUE (user_id, entry_date)
);
