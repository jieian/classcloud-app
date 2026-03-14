import StudentRosterClient from "./_components/StudentRosterClient";

export default async function StudentRosterPage({
  params,
}: {
  params: Promise<{ sectionId: string }>;
}) {
  const { sectionId } = await params;
  return (
    <>
      <h1 className="text-3xl font-bold mb-6 text-[#597D37]">
        Students Management
      </h1>
      <StudentRosterClient sectionId={Number(sectionId)} />
    </>
  );
}
