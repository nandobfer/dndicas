import { UserProfile } from "@/features/auth/auth-components";

export default function ProfilePage() {
    return (
        <div className="flex justify-center w-full">
            <UserProfile path="/profile" />
        </div>
    );
}
