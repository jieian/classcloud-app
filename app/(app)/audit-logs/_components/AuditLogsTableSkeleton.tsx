"use client";

import {
  Skeleton,
  Table,
  TableScrollContainer,
  TableTbody,
  TableTd,
  TableTh,
  TableThead,
  TableTr,
} from "@mantine/core";

export default function AuditLogsTableSkeleton({ hasViewAll = true }: { hasViewAll?: boolean }) {
  const rows = Array.from({ length: 10 }, (_, i) => (
    <TableTr key={i}>
      <TableTd><Skeleton height={14} radius="sm" /></TableTd>
      {hasViewAll && <TableTd><Skeleton height={14} radius="sm" w={120} /></TableTd>}
      <TableTd><Skeleton height={14} radius="sm" /></TableTd>
      <TableTd><Skeleton height={20} radius="xl" w={70} /></TableTd>
      <TableTd><Skeleton height={14} radius="sm" w={140} /></TableTd>
      <TableTd><Skeleton height={24} radius="sm" w={24} /></TableTd>
    </TableTr>
  ));

  return (
    <TableScrollContainer minWidth={600}>
      <Table verticalSpacing="sm">
        <TableThead>
          <TableTr>
            <TableTh>Timestamp</TableTh>
            {hasViewAll && <TableTh>Actor</TableTh>}
            <TableTh>Action</TableTh>
            <TableTh>Category</TableTh>
            <TableTh>Entity</TableTh>
            <TableTh />
          </TableTr>
        </TableThead>
        <TableTbody>{rows}</TableTbody>
      </Table>
    </TableScrollContainer>
  );
}
