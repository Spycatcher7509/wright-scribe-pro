import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.80.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Create admin user
    const { data: adminData, error: adminError } = await supabase.auth.admin.createUser({
      email: "admin@wrightscriber.co.uk",
      password: "OnePassword",
      email_confirm: true,
    });

    if (adminError) {
      console.error("Admin creation error:", adminError);
      return new Response(
        JSON.stringify({ error: "Failed to create admin", details: adminError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create profile for admin
    const { error: adminProfileError } = await supabase
      .from("profiles")
      .insert({
        id: adminData.user.id,
        email: "admin@wrightscriber.co.uk",
        user_group: "Admin",
        must_change_password: true,
      });

    if (adminProfileError) {
      console.error("Admin profile error:", adminProfileError);
    }

    // Assign admin role
    const { error: adminRoleError } = await supabase
      .from("user_roles")
      .insert({
        user_id: adminData.user.id,
        role: "admin",
      });

    if (adminRoleError) {
      console.error("Admin role error:", adminRoleError);
    }

    // Create regular user
    const { data: userData, error: userError } = await supabase.auth.admin.createUser({
      email: "user@wrightscriber.co.uk",
      password: "OnePassword",
      email_confirm: true,
    });

    if (userError) {
      console.error("User creation error:", userError);
      return new Response(
        JSON.stringify({ error: "Failed to create user", details: userError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create profile for user
    const { error: userProfileError } = await supabase
      .from("profiles")
      .insert({
        id: userData.user.id,
        email: "user@wrightscriber.co.uk",
        user_group: "User",
        must_change_password: true,
      });

    if (userProfileError) {
      console.error("User profile error:", userProfileError);
    }

    // Assign user role
    const { error: userRoleError } = await supabase
      .from("user_roles")
      .insert({
        user_id: userData.user.id,
        role: "user",
      });

    if (userRoleError) {
      console.error("User role error:", userRoleError);
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: "Default users created successfully",
        users: [
          { email: "admin@wrightscriber.co.uk", role: "admin" },
          { email: "user@wrightscriber.co.uk", role: "user" }
        ]
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
