import {
  Group,
  Skeleton,
  Table,
  TableScrollContainer,
  TableTbody,
  TableTd,
  TableTh,
  TableThead,
  TableTr,
  VisuallyHidden,
} from "@mantine/core";

export default function FacultyTableSkeleton() {
  const skeletonRows = Array(5)
    .fill(0)
    .map((_, index) => (
      <TableTr key={index}>
        <TableTd>
          <Skeleton height={20} width={150} radius="sm" />
        </TableTd>
        <TableTd>
          <Skeleton height={20} width={180} radius="sm" />
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
    <TableScrollContainer minWidth={800}>
      <Table verticalSpacing="sm">
        <TableThead>
          <TableTr>
            <TableTh>Employee</TableTh>
            <TableTh>Advisory Class</TableTh>
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
