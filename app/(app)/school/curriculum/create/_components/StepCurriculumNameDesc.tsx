"use client";

import { Box, Text, TextInput, Textarea } from "@mantine/core";
import type { UseFormReturnType } from "@mantine/form";
import type { CreateCurriculumForm } from "../_lib/types";

interface Props {
  form: UseFormReturnType<CreateCurriculumForm>;
}

export default function StepCurriculumNameDesc({ form }: Props) {
  return (
    <Box>
      <Text size="xl" fw={700} mb="md" c="#298925">
        Specify Curriculum Information
      </Text>

      <Box
        p="lg"
        w="100%"
        style={{
          border: "1px solid #B8B8B8",
          borderRadius: "8px",
          minWidth: 0,
        }}
      >
        <Text size="lg" fw={700} mb="xs" c="#298925">
          Name and Description
        </Text>

        <TextInput
          label="Name"
          placeholder="e.g. K-12 Enhanced Basic Education"
          required
          mb="md"
          maxLength={50}
          description={`${form.values.name.length}/50 characters`}
          {...form.getInputProps("name")}
        />

        <Textarea
          label="Description"
          placeholder="Briefly describe the purpose and scope of this curriculum"
          required
          autosize
          minRows={4}
          maxLength={500}
          description={`${form.values.description.length}/500 characters`}
          {...form.getInputProps("description")}
        />
      </Box>
    </Box>
  );
}
