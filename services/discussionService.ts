import { supabase } from '@/lib/supabase';
import { Discussion, Message } from '@/types';

export const discussionService = {
  async getDiscussions(): Promise<Discussion[]> {
    const { data, error } = await supabase
      .rpc('get_discussions_with_status', {
        p_user_id: supabase.auth.getUser()?.id
      });

    if (error) throw error;

    return data.map(d => ({
      id: d.id,
      title: d.title,
      content: d.content,
      author: {
        id: d.author_id,
        name: d.author_name,
        avatar: d.author_avatar,
      },
      upvotes: d.upvotes,
      messages: [],
      createdAt: new Date(d.created_at),
      hasUserUpvoted: d.has_user_upvoted,
      messageCount: Number(d.message_count),
    }));
  },

  async createDiscussion(title: string, content: string): Promise<Discussion> {
    const { data, error } = await supabase
      .from('discussions')
      .insert({
        title,
        content,
        user_id: supabase.auth.getUser()?.id,
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async toggleUpvote(discussionId: string): Promise<void> {
    const { error } = await supabase
      .rpc('toggle_discussion_upvote', {
        p_discussion_id: discussionId,
        p_user_id: supabase.auth.getUser()?.id,
      });

    if (error) throw error;
  },

  async getMessages(discussionId: string): Promise<Message[]> {
    const { data, error } = await supabase
      .from('discussion_messages')
      .select(`
        id,
        content,
        image_url,
        created_at,
        user_id,
        auth.users!inner (
          id,
          email
        ),
        user_profiles (
          username,
          avatar_url
        )
      `)
      .eq('discussion_id', discussionId)
      .order('created_at', { ascending: true });

    if (error) throw error;

    return data.map(m => ({
      id: m.id,
      content: m.content,
      imageUrl: m.image_url,
      createdAt: new Date(m.created_at),
      author: {
        id: m.users.id,
        name: m.user_profiles?.username || m.users.email.split('@')[0],
        avatar: m.user_profiles?.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${m.users.id}`,
      },
    }));
  },

  async sendMessage(discussionId: string, content: string, imageUrl?: string): Promise<Message> {
    const { data, error } = await supabase
      .from('discussion_messages')
      .insert({
        discussion_id: discussionId,
        content,
        image_url: imageUrl,
        user_id: supabase.auth.getUser()?.id,
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  },
}; 