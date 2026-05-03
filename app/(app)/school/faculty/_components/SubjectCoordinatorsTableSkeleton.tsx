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

export default function SubjectCoordinatorsTableSkeleton() {
  const skeletonRows = Array(5)
    .fill(0)
    .map((_, index) => (
      <TableTr key={index}>
        <TableTd>
          <Skeleton height={20} width={140} radius="sm" />
        </TableTd>
        <TableTd>
          <Skeleton height={20} width={180} radius="sm" />
        </TableTd>
        <TableTd>
          <Group gap={6} wrap="nowrap">
            <Skeleton height={22} width={52} radius="xl" />
            <Skeleton height={22} width={52} radius="xl" />
            <Skeleton height={22} width={52} radius="xl" />
          </Group>
        </TableTd>
        <TableTd>
          <Skeleton height={20} width={130} radius="sm" />
        </TableTd>
        <TableTd w={40}>
          <Group justify="flex-end">
            <Skeleton height={18} width={18} radius="xl" />
          </Group>
        </TableTd>
      </TableTr>
    ));

  return (
    <TableScrollContainer minWidth={1240} type="native">
      <Table
        verticalSpacing="sm"
        horizontalSpacing="md"
        style={{ tableLayout: "fixed" }}
      >
        <colgroup>
          <col style={{ width: "20%" }} />
          <col style={{ width: "21%" }} />
          <col style={{ width: "25%" }} />
          <col style={{ width: "26%" }} />
          <col style={{ width: "40px" }} />
        </colgroup>
        <TableThead>
          <TableTr>
            <TableTh w="20%">Subject Group Name</TableTh>
            <TableTh w="21%">Description</TableTh>
            <TableTh w="25%">Members</TableTh>
            <TableTh w="26%">Subject Coordinator</TableTh>
            <TableTh w={40} ta="right">
              <VisuallyHidden>Actions</VisuallyHidden>
            </TableTh>
          </TableTr>
        </TableThead>
        <TableTbody>{skeletonRows}</TableTbody>
      </Table>
    </TableScrollContainer>
  );
}
