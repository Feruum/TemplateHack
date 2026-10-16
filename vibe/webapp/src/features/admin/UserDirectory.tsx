import {
  userRoleSchema,
  type AdminUserSummary,
  type UserDto,
  type UserRole,
} from '@web-app-demo/contracts'
import { useState, type FormEvent } from 'react'

import { DataTableFrame } from '@/components/dashboard'
import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
} from '@/components/interface/alert'
import { Button } from '@/components/interface/button'
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from '@/components/interface/empty'
import { SearchField } from '@/components/interface/search-field'
import { Item } from '@/components/ui/item'
import { Select } from '@/components/interface/select'
import { Skeleton } from '@/components/interface/skeleton'
import { SortableDataTable, type DataColumn } from '@/components/interface/table'
import { Typography } from '@/components/typography'
import { useMediaQuery } from '@/hooks/use-media-query'
import { formatDate } from '@/platform/intl'
import {
  adminUsersPagination,
  adminUsersViewState,
  roleMutationFeedback,
} from './model'
import {
  useAdminUsersQuery,
  useUpdateAdminUserRoleMutation,
} from './queries'
import { RoleChangeDialog } from './RoleChangeDialog'

type PendingRoleChange = {
  role: UserRole
  user: AdminUserSummary
}

type DirectoryRowsProps = {
  currentUser: UserDto
  isRoleChangePending: boolean
  onRoleChange: (user: AdminUserSummary, role: UserRole) => void
  users: ReadonlyArray<AdminUserSummary>
}

// Tailwind's `sm` breakpoint. The frame's toolbar and footer stack below it through `sm:`
// classes, so the rows switch on the same edge. Below it the three columns do not fit a phone,
// and a table squeezed into a column with CSS loses its semantics: `display` overrides drop the
// table from the accessibility tree and a hidden `<thead>` takes the column labels with it. So
// each viewport gets markup of its own kind: a real table, or a list whose fields carry labels.
const tableViewportQuery = '(min-width: 40rem)'

export function UserDirectory({ currentUser }: { currentUser: UserDto }) {
  const [draftQuery, setDraftQuery] = useState('')
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)
  const [pendingRole, setPendingRole] = useState<PendingRoleChange | null>(null)
  const fitsTable = useMediaQuery(tableViewportQuery)
  const usersQuery = useAdminUsersQuery({
    q: query || undefined,
    page,
    pageSize: 20,
  })
  const roleMutation = useUpdateAdminUserRoleMutation()
  const viewState = adminUsersViewState({
    isError: usersQuery.isError,
    isPending: usersQuery.isPending,
    itemCount: usersQuery.data?.items.length,
  })
  const mutationFeedback = roleMutationFeedback(roleMutation)
  const pagination = usersQuery.data
    ? adminUsersPagination(usersQuery.data)
    : null

  const submitSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setPage(1)
    setQuery(draftQuery.trim())
  }

  const requestRoleChange = (user: AdminUserSummary, role: UserRole) => {
    roleMutation.reset()
    setPendingRole({ role, user })
  }

  const confirmRoleChange = () => {
    if (!pendingRole) return
    roleMutation.mutate(
      { role: pendingRole.role, userId: pendingRole.user.id },
      { onSuccess: () => setPendingRole(null) },
    )
  }

  const summary = usersQuery.data
    ? `Page ${usersQuery.data.page} of ${pagination?.totalPages ?? 1} · ${usersQuery.data.total} users${
        pagination?.wasBounded
          ? ` · First ${pagination.reachableUsers} matches available`
          : ''
      }`
    : viewState === 'error'
      ? 'Users unavailable'
      : 'Loading users'

  return (
    <>
      <div className="grid gap-4">
        {mutationFeedback?.kind === 'success' && (
          <Alert>
            <AlertTitle>Role changed</AlertTitle>
            <AlertDescription>
              {mutationFeedback.user.email} is now {mutationFeedback.user.role}.
              Their previous sessions have been revoked.
            </AlertDescription>
          </Alert>
        )}

        <DataTableFrame
          description="Role changes revoke the affected user’s active sessions."
          nextDisabled={!pagination?.canGoNext}
          onNext={() => setPage((current) => current + 1)}
          onPrevious={() => setPage((current) => Math.max(1, current - 1))}
          previousDisabled={page <= 1}
          summary={summary}
          title="User directory"
          toolbar={
            <form className="flex flex-col gap-2 sm:flex-row sm:items-end" onSubmit={submitSearch}>
              <SearchField
                aria-label="Search users"
                label="Search users"
                onValueChange={setDraftQuery}
                placeholder="Search by email or name"
                value={draftQuery}
              />
              <Button type="submit">Search</Button>
            </form>
          }
        >
          {viewState === 'loading' && <DirectoryLoading />}
          {viewState === 'error' && usersQuery.isError && (
            <DirectoryError
              error={usersQuery.error}
              onRetry={() => void usersQuery.refetch()}
            />
          )}
          {viewState === 'empty' && <DirectoryEmpty hasQuery={query.length > 0} />}
          {viewState === 'ready' && usersQuery.data && (
            fitsTable ? (
              <UserTable
                currentUser={currentUser}
                isRoleChangePending={roleMutation.isPending}
                onRoleChange={requestRoleChange}
                users={usersQuery.data.items}
              />
            ) : (
              <UserList
                currentUser={currentUser}
                isRoleChangePending={roleMutation.isPending}
                onRoleChange={requestRoleChange}
                users={usersQuery.data.items}
              />
            )
          )}
        </DataTableFrame>
      </div>

      <RoleChangeDialog
        failureReason={mutationFeedback?.kind === 'error' ? mutationFeedback.reason : null}
        isPending={roleMutation.isPending}
        onCancel={() => {
          roleMutation.reset()
          setPendingRole(null)
        }}
        onConfirm={confirmRoleChange}
        pendingChange={pendingRole}
      />
    </>
  )
}

function UserTable({
  currentUser,
  isRoleChangePending,
  onRoleChange,
  users,
}: DirectoryRowsProps) {
  const columns: DataColumn<AdminUserSummary>[] = [
    {
      key: 'displayName',
      label: 'User',
      sortable: false,
      render: (_value, user) => (
        <div className="grid">
          <Typography variant="bodySmMedium">
            {user.displayName ?? user.email}
          </Typography>
          <Typography variant="caption" tone="muted">
            {user.email}
          </Typography>
        </div>
      ),
    },
    {
      key: 'role',
      label: 'Role',
      sortable: false,
      render: (_value, user) => (
        <RoleSelect
          currentUser={currentUser}
          disabled={isRoleChangePending}
          onRoleChange={onRoleChange}
          user={user}
        />
      ),
    },
    {
      key: 'createdAt',
      label: 'Created',
      sortable: false,
      render: (_value, user) => (
        <Typography as="span" className="tabular-nums" variant="bodySm">
          {formatDate(user.createdAt)}
        </Typography>
      ),
    },
  ]

  return (
    <SortableDataTable
      caption="Users"
      columns={columns}
      rowKey="id"
      rows={[...users]}
    />
  )
}

/**
 * The narrow counterpart of `UserTable`: one list item per user, each a definition list whose
 * terms name the fields the table names with column headers. "User" and "Role" are visible in
 * the values themselves and stay screen-reader only; "Created" is the one a bare date needs.
 */
function UserList({
  currentUser,
  isRoleChangePending,
  onRoleChange,
  users,
}: DirectoryRowsProps) {
  return (
    // Explicit `role="list"`: WebKit drops list semantics from an unstyled `<ul>`, and phones
    // are exactly where this markup renders.
    <ul aria-label="Users" className="grid gap-3" role="list">
      {users.map((user) => (
        <Item asChild key={user.id} variant="outline">
          <li>
            <dl className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-3">
              <div className="grid min-w-0">
                <Typography as="dt" variant="srOnly">
                  User
                </Typography>
                <dd className="grid">
                  <Typography variant="bodySmMedium">
                    {user.displayName ?? user.email}
                  </Typography>
                  <Typography variant="caption" tone="muted" wrap="break">
                    {user.email}
                  </Typography>
                </dd>
              </div>
              <div>
                <Typography as="dt" variant="srOnly">
                  Role
                </Typography>
                <dd>
                  <RoleSelect
                    currentUser={currentUser}
                    disabled={isRoleChangePending}
                    onRoleChange={onRoleChange}
                    user={user}
                  />
                </dd>
              </div>
              <div className="col-span-2 flex items-center justify-between border-t pt-3">
                <Typography as="dt" variant="caption" tone="muted">
                  Created
                </Typography>
                <Typography as="dd" variant="bodySm">
                  {formatDate(user.createdAt)}
                </Typography>
              </div>
            </dl>
          </li>
        </Item>
      ))}
    </ul>
  )
}

function RoleSelect({
  currentUser,
  disabled,
  onRoleChange,
  user,
}: {
  currentUser: UserDto
  disabled: boolean
  onRoleChange: (user: AdminUserSummary, role: UserRole) => void
  user: AdminUserSummary
}) {
  return (
    <Select
      aria-label={`Role for ${user.email}`}
      className="w-28 capitalize"
      disabled={disabled}
      label="Role"
      onValueChange={(value) => {
        const parsedRole = userRoleSchema.safeParse(value)
        if (parsedRole.success && parsedRole.data !== user.role) {
          onRoleChange(user, parsedRole.data)
        }
      }}
      options={[
        {
          disabled: user.id === currentUser.id && user.role === 'admin',
          label: 'User',
          value: 'user',
        },
        { label: 'Admin', value: 'admin' },
      ]}
      value={user.role}
    />
  )
}

function DirectoryLoading() {
  return (
    <div aria-label="Loading users" className="grid gap-3 py-2" role="status">
      <Skeleton className="h-12 w-full" />
      <Skeleton className="h-12 w-full" />
      <Skeleton className="h-12 w-full" />
    </div>
  )
}

function DirectoryError({
  error,
  onRetry,
}: {
  error: Error
  onRetry: () => void
}) {
  return (
    <Alert variant="destructive">
      <AlertTitle>Users are unavailable</AlertTitle>
      <AlertDescription>{error.message}</AlertDescription>
      <AlertAction>
        <Button onClick={onRetry} size="sm" type="button" variant="outline">
          Try again
        </Button>
      </AlertAction>
    </Alert>
  )
}

function DirectoryEmpty({ hasQuery }: { hasQuery: boolean }) {
  return (
    <Empty>
      <EmptyHeader>
        <EmptyTitle>No users found</EmptyTitle>
        <EmptyDescription>
          {hasQuery
            ? 'Try a different name or email.'
            : 'No accounts are available yet.'}
        </EmptyDescription>
      </EmptyHeader>
    </Empty>
  )
}
