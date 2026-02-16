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

export default function RolesTableSkeleton() {
  const skeletonRows = Array(5)
    .fill(0)
    .map((_, index) => (
      <TableTr key={index}>
        <TableTd>
          <Skeleton height={20} width={120} radius="sm" />
        </TableTd>
        <TableTd>
          <Group gap="xs">
            <Skeleton height={24} width={100} radius="xl" />
            <Skeleton height={24} width={80} radius="xl" />
            <Skeleton height={24} width={90} radius="xl" />
          </Group>
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
            <TableTh>Role</TableTh>
            <TableTh>Permissions</TableTh>
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
