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
          <Skeleton height={20} width={160} radius="sm" />
        </TableTd>
        <TableTd>
          <Group gap={6} wrap="nowrap">
            <Skeleton height={22} width={52} radius="xl" />
            <Skeleton height={22} width={52} radius="xl" />
            <Skeleton height={22} width={52} radius="xl" />
          </Group>
        </TableTd>
        <TableTd w={72}>
          <Group gap={0} justify="flex-end">
            <Skeleton height={18} width={18} radius="xl" mr={10} />
            <Skeleton height={18} width={18} radius="xl" />
          </Group>
        </TableTd>
      </TableTr>
    ));

  return (
    <TableScrollContainer minWidth={1080} type="native">
      <Table
        verticalSpacing="sm"
        horizontalSpacing="md"
        style={{ tableLayout: "fixed" }}
      >
        <colgroup>
          <col style={{ width: "26%" }} />
          <col style={{ width: "24%" }} />
          <col style={{ width: "42%" }} />
          <col style={{ width: "72px" }} />
        </colgroup>
        <TableThead>
          <TableTr>
            <TableTh w="26%">Employee</TableTh>
            <TableTh w="24%">Advisory Class</TableTh>
            <TableTh>Teaching Load</TableTh>
            <TableTh w={72} ta="right">
              <VisuallyHidden>Actions</VisuallyHidden>
            </TableTh>
          </TableTr>
        </TableThead>
        <TableTbody>{skeletonRows}</TableTbody>
      </Table>
    </TableScrollContainer>
  );
}
