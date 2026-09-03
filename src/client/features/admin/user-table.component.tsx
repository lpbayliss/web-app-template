import { useState } from "react";
import { useIntl } from "react-intl";
import { Button } from "#client/components/button.component";
import { Input } from "#client/components/input.component";
import { useAdminUsers, useSetRole } from "./use-admin-users.hook";

export function UserTable({ currentUserId }: { currentUserId: string }) {
  const intl = useIntl();
  const [search, setSearch] = useState("");
  const users = useAdminUsers(search);
  const setRole = useSetRole();

  return (
    <div className="space-y-4">
      <Input
        label={intl.formatMessage({ id: "admin.search" })}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        type="search"
      />
      {users.data && (
        <p className="text-sm text-muted">
          {intl.formatMessage({ id: "admin.total" }, { total: users.data.total })}
        </p>
      )}
      <div className="overflow-x-auto rounded-card border border-line">
        <table className="w-full text-sm">
          <thead className="bg-line/40 text-left">
            <tr>
              <th className="px-3 py-2">{intl.formatMessage({ id: "auth.name" })}</th>
              <th className="px-3 py-2">{intl.formatMessage({ id: "auth.email" })}</th>
              <th className="px-3 py-2">{intl.formatMessage({ id: "admin.role" })}</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {users.data?.items.map((user) => (
              <tr key={user.id} className="border-t border-line">
                <td className="px-3 py-2">{user.name}</td>
                <td className="px-3 py-2">{user.email}</td>
                <td className="px-3 py-2">
                  {user.role}
                  {user.banned && (
                    <span className="ml-2 text-danger">
                      {intl.formatMessage({ id: "admin.banned" })}
                    </span>
                  )}
                </td>
                <td className="px-3 py-2 text-right">
                  {user.id !== currentUserId && (
                    <Button
                      size="sm"
                      variant="secondary"
                      loading={setRole.isPending && setRole.variables?.userId === user.id}
                      onClick={() =>
                        setRole.mutate({
                          userId: user.id,
                          role: user.role === "admin" ? "user" : "admin",
                        })
                      }
                    >
                      {intl.formatMessage({
                        id: user.role === "admin" ? "admin.makeUser" : "admin.makeAdmin",
                      })}
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
