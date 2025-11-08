-- Create function to handle new user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  -- Create profile entry if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = NEW.id) THEN
    INSERT INTO public.profiles (id, email, user_group, created_at, updated_at)
    VALUES (NEW.id, NEW.email, 'User', NOW(), NOW());
  END IF;

  -- Create default user role entry if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = NEW.id) THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'user');
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create trigger for new user signups
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- Backfill existing users who don't have profiles
DO $$
DECLARE
  auth_user RECORD;
BEGIN
  FOR auth_user IN SELECT id, email, created_at FROM auth.users LOOP
    -- Insert profile if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth_user.id) THEN
      INSERT INTO public.profiles (id, email, user_group, created_at, updated_at)
      VALUES (auth_user.id, auth_user.email, 'User', auth_user.created_at, NOW());
    END IF;
    
    -- Insert role if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth_user.id) THEN
      INSERT INTO public.user_roles (user_id, role)
      VALUES (auth_user.id, 'user');
    END IF;
  END LOOP;
END $$;