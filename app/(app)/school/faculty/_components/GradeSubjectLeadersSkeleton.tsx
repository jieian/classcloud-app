import {
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

export default function GradeSubjectLeadersSkeleton() {
  const skeletonRows = Array(5)
    .fill(0)
    .map((_, index) => (
      <TableTr key={index}>
        <TableTd>
          <Skeleton height={20} width={160} radius="sm" />
        </TableTd>
        <TableTd>
          <Skeleton height={20} width={200} radius="sm" />
        </TableTd>
        <TableTd>
          <Skeleton height={20} width={140} radius="sm" />
        </TableTd>
        <TableTd w={40}>
          <Skeleton height={18} width={18} radius="xl" style={{ marginLeft: "auto" }} />
        </TableTd>
      </TableTr>
    ));

  return (
    <div>
      {/* Grade panel header skeleton */}
      <Skeleton height={24} width={180} radius="sm" mb="md" />
      <TableScrollContainer minWidth={600} type="native">
        <Table
          verticalSpacing="sm"
          horizontalSpacing="md"
          style={{ tableLayout: "fixed" }}
        >
          <colgroup>
            <col style={{ width: "28%" }} />
            <col style={{ width: "37%" }} />
            <col style={{ width: "27%" }} />
            <col style={{ width: "40px" }} />
          </colgroup>
          <TableThead>
            <TableTr>
              <TableTh>Subject Name</TableTh>
              <TableTh>Description</TableTh>
              <TableTh>Grade Subject Leader</TableTh>
              <TableTh w={40} ta="right">
                <VisuallyHidden>Actions</VisuallyHidden>
              </TableTh>
            </TableTr>
          </TableThead>
          <TableTbody>{skeletonRows}</TableTbody>
        </Table>
      </TableScrollContainer>
    </div>
  );
}
