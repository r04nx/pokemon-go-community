-- Drop existing tables if they exist (in correct order)
DROP TABLE IF EXISTS discussion_upvotes CASCADE;
DROP TABLE IF EXISTS discussion_messages CASCADE;
DROP TABLE IF EXISTS likes CASCADE;
DROP TABLE IF EXISTS comments CASCADE;
DROP TABLE IF EXISTS discussions CASCADE;

-- Create discussions table
CREATE TABLE discussions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    upvotes INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create messages table for discussion replies
CREATE TABLE discussion_messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    discussion_id UUID REFERENCES discussions(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    image_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create upvotes tracking table
CREATE TABLE discussion_upvotes (
    discussion_id UUID REFERENCES discussions(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (discussion_id, user_id)
);

-- Create function to handle upvoting
CREATE OR REPLACE FUNCTION toggle_discussion_upvote(
    p_discussion_id UUID,
    p_user_id UUID
) RETURNS discussions AS $$
DECLARE
    v_discussion discussions;
BEGIN
    -- Try to delete existing upvote
    DELETE FROM discussion_upvotes
    WHERE discussion_id = p_discussion_id AND user_id = p_user_id
    RETURNING discussion_id INTO v_discussion.id;
    
    IF NOT FOUND THEN
        -- If no upvote existed, create one
        INSERT INTO discussion_upvotes (discussion_id, user_id)
        VALUES (p_discussion_id, p_user_id);
        
        UPDATE discussions
        SET upvotes = upvotes + 1
        WHERE id = p_discussion_id
        RETURNING * INTO v_discussion;
    ELSE
        -- If upvote was deleted, decrease count
        UPDATE discussions
        SET upvotes = upvotes - 1
        WHERE id = p_discussion_id
        RETURNING * INTO v_discussion;
    END IF;
    
    RETURN v_discussion;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create function to get discussions with user upvote status
CREATE OR REPLACE FUNCTION get_discussions_with_status(p_user_id UUID)
RETURNS TABLE (
    id UUID,
    title TEXT,
    content TEXT,
    upvotes INTEGER,
    created_at TIMESTAMPTZ,
    has_user_upvoted BOOLEAN,
    author_id UUID,
    author_name TEXT,
    author_avatar TEXT,
    message_count BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        d.id,
        d.title,
        d.content,
        d.upvotes,
        d.created_at,
        EXISTS (
            SELECT 1 FROM discussion_upvotes du 
            WHERE du.discussion_id = d.id AND du.user_id = p_user_id
        ) as has_user_upvoted,
        u.id as author_id,
        COALESCE(up.username, u.email) as author_name,
        COALESCE(up.avatar_url, 'https://api.dicebear.com/7.x/avataaars/svg?seed=' || u.id) as author_avatar,
        COUNT(dm.id) as message_count
    FROM discussions d
    JOIN auth.users u ON d.user_id = u.id
    LEFT JOIN user_profiles up ON u.id = up.id
    LEFT JOIN discussion_messages dm ON d.id = dm.discussion_id
    GROUP BY d.id, u.id, up.username, up.avatar_url, u.email
    ORDER BY d.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Enable RLS
ALTER TABLE discussions ENABLE ROW LEVEL SECURITY;
ALTER TABLE discussion_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE discussion_upvotes ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view all discussions"
    ON discussions FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "Users can create discussions"
    ON discussions FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view all messages"
    ON discussion_messages FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "Users can create messages"
    ON discussion_messages FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can manage upvotes"
    ON discussion_upvotes FOR ALL
    TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id); 