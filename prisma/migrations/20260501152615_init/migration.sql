-- CreateTable
CREATE TABLE "users" (
    "id" BIGSERIAL NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'customer',
    "company" TEXT,
    "note" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settings" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,

    CONSTRAINT "settings_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "password_resets" (
    "id" BIGSERIAL NOT NULL,
    "user_id" BIGINT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "used_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_resets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outbox" (
    "id" BIGSERIAL NOT NULL,
    "kind" TEXT NOT NULL,
    "to_email" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "error" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sent_at" TIMESTAMPTZ(6),

    CONSTRAINT "outbox_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" BIGSERIAL NOT NULL,
    "user_id" BIGINT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inbox_threads" (
    "id" BIGSERIAL NOT NULL,
    "owner_user_id" BIGINT NOT NULL,
    "subject" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inbox_threads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inbox_messages" (
    "id" BIGSERIAL NOT NULL,
    "thread_id" BIGINT NOT NULL,
    "sender_user_id" BIGINT NOT NULL,
    "sender_role" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inbox_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inbox_attachments" (
    "id" BIGSERIAL NOT NULL,
    "thread_id" BIGINT NOT NULL,
    "message_id" BIGINT,
    "uploader_user_id" BIGINT NOT NULL,
    "original_name" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size_bytes" BIGINT NOT NULL,
    "storage_path" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inbox_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "booking_categories" (
    "id" BIGSERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "deposit_amount_minor" BIGINT NOT NULL DEFAULT 50000,
    "currency" TEXT NOT NULL DEFAULT 'try',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "booking_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "calendar_bookings" (
    "id" BIGSERIAL NOT NULL,
    "user_id" BIGINT,
    "category_id" BIGINT,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "booking_date" DATE NOT NULL,
    "slot_start" TEXT NOT NULL,
    "slot_end" TEXT NOT NULL,
    "note" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "calendar_bookings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_requests" (
    "id" BIGSERIAL NOT NULL,
    "booking_id" BIGINT NOT NULL,
    "provider" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "amount_minor" BIGINT NOT NULL,
    "currency" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'created',
    "provider_ref" TEXT,
    "pay_url" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paid_at" TIMESTAMPTZ(6),

    CONSTRAINT "payment_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "idx_password_resets_user_id" ON "password_resets"("user_id");

-- CreateIndex
CREATE INDEX "idx_password_resets_token_hash" ON "password_resets"("token_hash");

-- CreateIndex
CREATE INDEX "idx_outbox_created_at" ON "outbox"("created_at");

-- CreateIndex
CREATE INDEX "idx_sessions_token_hash" ON "sessions"("token_hash");

-- CreateIndex
CREATE INDEX "idx_sessions_user_id" ON "sessions"("user_id");

-- CreateIndex
CREATE INDEX "idx_inbox_threads_owner" ON "inbox_threads"("owner_user_id");

-- CreateIndex
CREATE INDEX "idx_inbox_threads_updated" ON "inbox_threads"("updated_at");

-- CreateIndex
CREATE INDEX "idx_inbox_messages_thread" ON "inbox_messages"("thread_id");

-- CreateIndex
CREATE INDEX "idx_inbox_attachments_thread" ON "inbox_attachments"("thread_id");

-- CreateIndex
CREATE UNIQUE INDEX "booking_categories_name_key" ON "booking_categories"("name");

-- CreateIndex
CREATE INDEX "idx_booking_categories_active" ON "booking_categories"("active", "sort_order", "id");

-- CreateIndex
CREATE INDEX "idx_calendar_bookings_date_slot" ON "calendar_bookings"("booking_date", "slot_start");

-- CreateIndex
CREATE INDEX "idx_calendar_bookings_status" ON "calendar_bookings"("status");

-- CreateIndex
CREATE INDEX "idx_payment_requests_booking_id" ON "payment_requests"("booking_id");

-- CreateIndex
CREATE INDEX "idx_payment_requests_provider_ref" ON "payment_requests"("provider_ref");

-- AddForeignKey
ALTER TABLE "password_resets" ADD CONSTRAINT "password_resets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inbox_threads" ADD CONSTRAINT "inbox_threads_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inbox_messages" ADD CONSTRAINT "inbox_messages_thread_id_fkey" FOREIGN KEY ("thread_id") REFERENCES "inbox_threads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inbox_messages" ADD CONSTRAINT "inbox_messages_sender_user_id_fkey" FOREIGN KEY ("sender_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inbox_attachments" ADD CONSTRAINT "inbox_attachments_thread_id_fkey" FOREIGN KEY ("thread_id") REFERENCES "inbox_threads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inbox_attachments" ADD CONSTRAINT "inbox_attachments_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "inbox_messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inbox_attachments" ADD CONSTRAINT "inbox_attachments_uploader_user_id_fkey" FOREIGN KEY ("uploader_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calendar_bookings" ADD CONSTRAINT "calendar_bookings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calendar_bookings" ADD CONSTRAINT "calendar_bookings_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "booking_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_requests" ADD CONSTRAINT "payment_requests_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "calendar_bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
