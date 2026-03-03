
import dbConnect from "../src/core/database/db";
import { CharacterClass } from "../src/features/classes/models/character-class";
import mongoose from "mongoose";

async function testSubclasses() {
  try {
    console.log("Connecting to database...");
    await dbConnect();

    const className = "Test Class " + Date.now();
    console.log(`Creating test class: ${className}`);

    const newClass = await CharacterClass.create({
      name: className,
      description: "A class for testing subclass persistence",
      hitDice: "d8",
      primaryAttributes: ["Força"],
      savingThrows: ["Força", "Constituição"],
      skillCount: 2,
      availableSkills: ["Acrobacia", "Atletismo"],
      spellcasting: "Nenhum",
      status: "active",
      subclasses: [],
      traits: []
    });

    const classId = newClass._id;
    console.log(`Class created with ID: ${classId}`);

    const subclassData = {
      name: "Test Subclass",
      description: "A test subclass description",
      image: "https://example.com/image.png",
      spellcasting: "Completo",
      spellcastingAttribute: "Inteligência",
      traits: [
        { level: 1, description: "Trait 1 description" },
        { level: 3, description: "Trait 3 description" }
      ]
    };

    console.log("Updating class with subclass data...");
    const updatedClass = await CharacterClass.findByIdAndUpdate(
      classId,
      { $set: { subclasses: [subclassData] } },
      { new: true, runValidators: true }
    ).lean();

    if (!updatedClass) {
      throw new Error("Failed to find and update class");
    }

    console.log("Verifying updated data (immediate response):");
    const subclass = updatedClass.subclasses[0];
    console.log("- Subclass Name:", subclass.name);
    console.log("- Subclass Image:", subclass.image);
    console.log("- Subclass Traits Count:", subclass.traits?.length);
    if (subclass.traits && subclass.traits.length > 0) {
        console.log("- First Trait Level:", subclass.traits[0].level);
        console.log("- First Trait Description:", subclass.traits[0].description);
    }

    console.log("\nFetching again from DB to be sure...");
    const fetchedClass = await CharacterClass.findById(classId).lean();
    const fetchedSubclass = fetchedClass.subclasses[0];

    let success = true;
    if (fetchedSubclass.image !== subclassData.image) {
      console.error(`❌ Image mismatch! Expected ${subclassData.image}, got ${fetchedSubclass.image}`);
      success = false;
    } else {
      console.log("✅ Image persisted correctly");
    }

    if (!fetchedSubclass.traits || fetchedSubclass.traits.length !== subclassData.traits.length) {
      console.error(`❌ Traits count mismatch! Expected ${subclassData.traits.length}, got ${fetchedSubclass.traits?.length}`);
      success = false;
    } else {
      console.log("✅ Traits count persisted correctly");
      if (fetchedSubclass.traits[0].description !== subclassData.traits[0].description) {
        console.error(`❌ Trait description mismatch! Expected ${subclassData.traits[0].description}, got ${fetchedSubclass.traits[0].description}`);
        success = false;
      } else {
        console.log("✅ Trait details persisted correctly");
      }
    }

    if (fetchedSubclass.spellcasting !== subclassData.spellcasting) {
        console.error(`❌ Spellcasting mismatch! Expected ${subclassData.spellcasting}, got ${fetchedSubclass.spellcasting}`);
        success = false;
    } else {
        console.log("✅ Spellcasting persisted correctly");
    }

    // Cleanup
    await CharacterClass.findByIdAndDelete(classId);
    console.log("\nTest class deleted.");

    if (success) {
      console.log("\nSUMMARY: Subclass persistence test PASSED! 🎉");
    } else {
      console.log("\nSUMMARY: Subclass persistence test FAILED! ❌");
    }

  } catch (error) {
    console.error("Test failed with error:", error);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
}

testSubclasses();
