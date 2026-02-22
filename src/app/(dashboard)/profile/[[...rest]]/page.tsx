import { UserProfile } from "@clerk/nextjs";

export default function ProfilePage() {
    return (
        <div className="flex justify-center w-full">
            <UserProfile path="/profile" />
        </div>
    );
}
