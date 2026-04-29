import React from 'react';
import { User as UserIcon, Mail, Shield, Calendar, Edit3 } from 'lucide-react';
import { useUserContext } from '@/hooks/useUserContext';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Link } from 'react-router-dom';

export const UserPage: React.FC = () => {
  const { user, isLoading, isError } = useUserContext();

  if (isLoading) {
    return (
      <div className="container py-10 flex justify-center items-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (isError || !user) {
    return (
      <div className="container py-10">
        <Card className="border-destructive/20 bg-destructive/5">
          <CardContent className="pt-6">
            <p className="text-destructive font-medium">
              {isError ? 'Error loading user information.' : 'User information not found.'}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const displayName = [user.first_name, user.last_name].filter(Boolean).join(' ') || user.username;
  const joinedDate = new Date(user.created_at).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <div className="container py-10 fade-in max-w-4xl">
      {/* Simple Header */}
      <div className="flex items-center gap-5 mb-10">
        <div
          className="w-16 h-16 rounded-2xl flex items-center justify-center text-white shrink-0"
          style={{ background: 'var(--accent-gradient)', boxShadow: 'var(--shadow-glow)' }}
        >
          <UserIcon size={32} />
        </div>
        <div>
          <h1 className="heading-1">{displayName}</h1>
          <p className="text-muted-foreground flex items-center gap-2 mt-1">
            @{user.username}
            <Badge variant="secondary" className="capitalize text-[10px] py-0 px-1.5 h-4">
              {user.role}
            </Badge>
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6">
        <Card className="border-border/60">
          <CardHeader className="pb-3 flex flex-row items-center justify-between">
            <CardTitle className="text-lg font-bold">Account Information</CardTitle>
            <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-xs text-muted-foreground">
              <Edit3 size={14} /> Edit
            </Button>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div className="space-y-1">
                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                  Email
                </span>
                <p className="font-medium flex items-center gap-2">
                  <Mail size={14} className="text-primary/70" />
                  {user.email}
                </p>
              </div>
              <div className="space-y-1">
                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                  Role
                </span>
                <p className="font-medium flex items-center gap-2">
                  <Shield size={14} className="text-primary/70" />
                  <span className="capitalize">{user.role}</span>
                </p>
              </div>
              <div className="space-y-1">
                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                  Status
                </span>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-success" />
                  <p className="font-medium">Verified Account</p>
                </div>
              </div>
              <div className="space-y-1">
                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                  Member Since
                </span>
                <p className="font-medium flex items-center gap-2">
                  <Calendar size={14} className="text-primary/70" />
                  {joinedDate}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-primary/5 border-primary/20 border-dashed">
          <CardContent className="py-6 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div>
              <h3 className="font-bold text-sm">Need to update your details?</h3>
              <p className="text-xs text-muted-foreground mt-1">
                Contact the OpenML support team to change your primary account settings.
              </p>
            </div>
            <Link to="https://github.com/orgs/openml/discussions">
              <Button variant="outline" size="sm" className="shrink-0">
                Contact Support
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
