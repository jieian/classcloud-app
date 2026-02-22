import {
  Skeleton,
  Table,
  TableScrollContainer,
  TableThead,
  TableTbody,
  TableTr,
  TableTh,
  TableTd,
  Group,
  VisuallyHidden,
} from "@mantine/core";

export default function PendingUsersTableSkeleton() {
  const skeletonRows = Array(3)
    .fill(0)
    .map((_, index) => (
      <TableTr key={index}>
        <TableTd>
          <Group gap="sm">
            <Skeleton height={20} width={150} radius="sm" />
          </Group>
        </TableTd>
        <TableTd>
          <Skeleton height={16} width={180} radius="sm" />
        </TableTd>
        <TableTd>
          <Group gap={0} justify="flex-end">
            <Skeleton height={28} width={28} radius="sm" mr={4} />
            <Skeleton height={28} width={28} radius="sm" />
          </Group>
        </TableTd>
      </TableTr>
    ));

  return (
    <TableScrollContainer minWidth={600}>
      <Table verticalSpacing="sm">
        <TableThead>
          <TableTr>
            <TableTh>Full Name</TableTh>
            <TableTh>Email</TableTh>
            <TableTh>
              <VisuallyHidden>Actions</VisuallyHidden>
            </TableTh>
          </TableTr>
        </TableThead>
        <TableTbody>{skeletonRows}</TableTbody>
      </Table>
    </TableScrollContainer>
  );
}
