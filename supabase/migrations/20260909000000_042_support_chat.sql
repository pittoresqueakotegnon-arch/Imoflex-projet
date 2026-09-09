-- ==============================================================================
-- ImoFlex - Migration 042 - Support Chat System
-- ==============================================================================

-- 1. Drop old support_tickets table and related policies
DROP TRIGGER IF EXISTS update_support_tickets_updated_at ON public.support_tickets;
DROP TABLE IF EXISTS public.support_tickets CASCADE;

-- 2. Create support_conversations table
CREATE TABLE IF NOT EXISTS public.support_conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    visitor_id TEXT, -- For anonymous users
    status TEXT NOT NULL DEFAULT 'ouverte' CHECK (status IN ('ouverte', 'en_cours', 'resolue')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    last_message_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- Ensure a conversation belongs to either a user or a visitor
ALTER TABLE public.support_conversations
ADD CONSTRAINT conversation_owner_check 
CHECK (user_id IS NOT NULL OR visitor_id IS NOT NULL);

-- 3. Create support_messages table
CREATE TABLE IF NOT EXISTS public.support_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES public.support_conversations(id) ON DELETE CASCADE,
    sender_type TEXT NOT NULL CHECK (sender_type IN ('user', 'admin')),
    sender_id UUID REFERENCES auth.users(id) ON DELETE SET NULL, -- Null if sent by anonymous visitor
    message TEXT NOT NULL,
    screenshot_url TEXT,
    read_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- 4. Enable RLS
ALTER TABLE public.support_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_messages ENABLE ROW LEVEL SECURITY;

-- 5. Policies for support_conversations
-- Users/visitors can insert their own conversations
CREATE POLICY "Users can create conversations" 
ON public.support_conversations FOR INSERT 
WITH CHECK (
    (auth.uid() = user_id) OR 
    (auth.uid() IS NULL AND visitor_id IS NOT NULL)
);

-- Users/visitors can read their own conversations
CREATE POLICY "Users can read own conversations" 
ON public.support_conversations FOR SELECT 
USING (
    (auth.uid() = user_id) OR 
    (auth.uid() IS NULL AND visitor_id IS NOT NULL) OR
    (EXISTS (SELECT 1 FROM public.users WHERE users.id = auth.uid() AND users.role = 'admin'))
);

-- Admins can update conversations
CREATE POLICY "Admins can update conversations" 
ON public.support_conversations FOR UPDATE 
USING (
    EXISTS (SELECT 1 FROM public.users WHERE users.id = auth.uid() AND users.role = 'admin')
)
WITH CHECK (
    EXISTS (SELECT 1 FROM public.users WHERE users.id = auth.uid() AND users.role = 'admin')
);

-- Users/visitors can also update their own conversations (e.g., update last_message_at)
CREATE POLICY "Users can update own conversations" 
ON public.support_conversations FOR UPDATE 
USING (
    (auth.uid() = user_id) OR 
    (auth.uid() IS NULL AND visitor_id IS NOT NULL)
)
WITH CHECK (
    (auth.uid() = user_id) OR 
    (auth.uid() IS NULL AND visitor_id IS NOT NULL)
);


-- 6. Policies for support_messages
-- Users/visitors can insert messages in their own conversations
CREATE POLICY "Users can insert messages" 
ON public.support_messages FOR INSERT 
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.support_conversations c
        WHERE c.id = conversation_id AND (
            (auth.uid() = c.user_id) OR 
            (auth.uid() IS NULL AND c.visitor_id IS NOT NULL) OR
            (EXISTS (SELECT 1 FROM public.users WHERE users.id = auth.uid() AND users.role = 'admin'))
        )
    )
);

-- Users/visitors can read messages in their own conversations
CREATE POLICY "Users can read messages" 
ON public.support_messages FOR SELECT 
USING (
    EXISTS (
        SELECT 1 FROM public.support_conversations c
        WHERE c.id = conversation_id AND (
            (auth.uid() = c.user_id) OR 
            (auth.uid() IS NULL AND c.visitor_id IS NOT NULL) OR
            (EXISTS (SELECT 1 FROM public.users WHERE users.id = auth.uid() AND users.role = 'admin'))
        )
    )
);

-- Admins can update messages (e.g. read_at)
CREATE POLICY "Admins can update messages" 
ON public.support_messages FOR UPDATE 
USING (
    EXISTS (SELECT 1 FROM public.users WHERE users.id = auth.uid() AND users.role = 'admin')
)
WITH CHECK (
    EXISTS (SELECT 1 FROM public.users WHERE users.id = auth.uid() AND users.role = 'admin')
);

-- Users can update messages (e.g. read_at for admin messages)
CREATE POLICY "Users can update messages" 
ON public.support_messages FOR UPDATE 
USING (
    EXISTS (
        SELECT 1 FROM public.support_conversations c
        WHERE c.id = conversation_id AND (
            (auth.uid() = c.user_id) OR 
            (auth.uid() IS NULL AND c.visitor_id IS NOT NULL)
        )
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.support_conversations c
        WHERE c.id = conversation_id AND (
            (auth.uid() = c.user_id) OR 
            (auth.uid() IS NULL AND c.visitor_id IS NOT NULL)
        )
    )
);

-- 7. Setup triggers for updated_at
CREATE TRIGGER update_support_conversations_updated_at
BEFORE UPDATE ON public.support_conversations
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- 8. Enable Realtime
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'support_conversations'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.support_conversations;
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'support_messages'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.support_messages;
    END IF;
END $$;

-- 9. Storage for Support Attachments
INSERT INTO storage.buckets (id, name, public) 
VALUES ('support_attachments', 'support_attachments', true)
ON CONFLICT (id) DO NOTHING;

-- RLS for Storage (Insert allowed for everyone, read allowed for everyone because the URL will be unpredictable UUIDs)
CREATE POLICY "Allow public insert on support_attachments" 
ON storage.objects FOR INSERT 
WITH CHECK (bucket_id = 'support_attachments');

CREATE POLICY "Allow public select on support_attachments" 
ON storage.objects FOR SELECT 
USING (bucket_id = 'support_attachments');
