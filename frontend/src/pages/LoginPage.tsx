import React from 'react';
import { motion } from 'motion/react';
import { LogIn, User, ShieldCheck } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';

export const LoginPage: React.FC = () => {
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleLogin = (role: 'user' | 'expert') => {
    login(role);
    navigate('/datasets');
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: 'easeOut' }}
      className="container"
      style={{
        padding: '5rem 1.5rem',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
      }}
    >
      {/* Hero */}
      <div className="text-center mb-12 max-w-lg">
        <div
          className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-6"
          style={{ background: 'var(--accent-gradient)', boxShadow: 'var(--shadow-glow)' }}
        >
          <LogIn size={28} color="white" />
        </div>
        <h1 className="heading-1 mb-3">Welcome to OpenML CDI</h1>
        <p className="subheading">Select your role to continue to the platform.</p>
      </div>

      {/* Role cards */}
      <motion.div
        initial="hidden"
        animate="visible"
        variants={{ visible: { transition: { staggerChildren: 0.15, delayChildren: 0.2 } } }}
        className="grid grid-cols-1 md:grid-cols-2 gap-5 w-full max-w-2xl"
      >
        {/* User */}
        <motion.div
          variants={{ hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0 } }}
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.98 }}
        >
          <Card
            className="cursor-pointer group h-full transition-all duration-200 hover:shadow-lg border-2 hover:border-primary/40"
            onClick={() => handleLogin('user')}
          >
            <CardHeader className="items-center text-center pb-3">
              <div className="w-14 h-14 rounded-xl flex items-center justify-center mb-3 bg-muted text-muted-foreground transition-all duration-200 group-hover:bg-primary/10 group-hover:text-primary">
                <User size={30} />
              </div>
              <CardTitle className="text-xl">User</CardTitle>
              <CardDescription className="text-sm leading-relaxed">
                Upload new datasets and track the processing status of your past submissions.
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-1">
              <Button className="w-full" size="lg">
                Continue as User
              </Button>
            </CardContent>
          </Card>
        </motion.div>

        {/* Expert */}
        <motion.div
          variants={{ hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0 } }}
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.98 }}
        >
          <Card
            className="cursor-pointer group h-full transition-all duration-200 hover:shadow-lg border-2 hover:border-violet-400/60"
            onClick={() => handleLogin('expert')}
          >
            <CardHeader className="items-center text-center pb-3">
              <div className="w-14 h-14 rounded-xl flex items-center justify-center mb-3 text-violet-500 bg-violet-50 dark:bg-violet-950/30 transition-all duration-200 group-hover:bg-violet-100 dark:group-hover:bg-violet-900/40">
                <ShieldCheck size={30} />
              </div>
              <CardTitle className="text-xl">Expert</CardTitle>
              <CardDescription className="text-sm leading-relaxed">
                Expert view. Review all submissions, change processing states, and download files.
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-1">
              <Button
                size="lg"
                className="w-full bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white shadow-md"
              >
                Continue as Expert
              </Button>
            </CardContent>
          </Card>
        </motion.div>
      </motion.div>
    </motion.div>
  );
};
